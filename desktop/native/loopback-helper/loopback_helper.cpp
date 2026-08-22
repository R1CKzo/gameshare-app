// loopback_helper.exe — captura audio de um processo especifico do Windows
// (ou de tudo, exceto um processo especifico) usando a API de "process
// loopback" do Windows (a mesma que Discord/OBS usam). So existe a partir
// do Windows 10 build 20348 — em versoes mais antigas a ativacao falha de
// forma limpa (codigo de saida 2) e quem chamou (o Electron) trata como
// "sem audio disponivel" em vez de travar o compartilhamento de tela.
//
// Uso:
//   loopback_helper.exe exclude <pid>          grava tudo, menos esse pid
//   loopback_helper.exe include-window <hwnd>  grava so o dono dessa janela
//
// Saida: um cabecalho fixo de 16 bytes, seguido de audio PCM 48kHz/16-bit/
// estereo continuo em stdout (binario), ate o processo ser encerrado.
//
// Processo separado (nao um addon nativo do Node) de proposito: assim o
// Electron nao precisa recompilar nada toda vez que o Electron/Node muda de
// versao, e se esse helper travar ou for morto ele nao derruba o app
// principal — so perde o audio do sistema, a chamada de voz continua.

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <objbase.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <propvarutil.h>
#include <unknwn.h>

#include <cstdio>
#include <cstdint>
#include <cwchar>
#include <cstdlib>
#include <io.h>
#include <fcntl.h>
#include <vector>

#pragma comment(lib, "ole32.lib")

#ifndef VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK
#define VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK L"VAD\\Process_Loopback"
#endif

namespace {

constexpr UINT32 kSampleRate = 48000;
constexpr UINT16 kChannels = 2;
constexpr UINT16 kBitsPerSample = 16;
constexpr DWORD kActivationTimeoutMs = 5000;
constexpr REFERENCE_TIME kBufferDuration100ns = 2'000'000; // 200ms

using ActivateAudioInterfaceAsyncFn = HRESULT(WINAPI*)(
    LPCWSTR deviceInterfacePath,
    REFIID riid,
    PROPVARIANT* activationParams,
    IActivateAudioInterfaceCompletionHandler* completionHandler,
    IActivateAudioInterfaceAsyncOperation** activationOperation);

#pragma pack(push, 1)
struct StreamHeader {
  char magic[4];
  uint32_t sampleRate;
  uint16_t channels;
  uint16_t bitsPerSample;
  uint32_t reserved;
};
#pragma pack(pop)

// Recebe o resultado da ativacao assincrona e libera a thread principal,
// que ficou esperando nesse evento. E o unico jeito de usar
// ActivateAudioInterfaceAsync — nao existe uma variante sincrona.
class ActivationHandler : public IActivateAudioInterfaceCompletionHandler {
 public:
  ActivationHandler() { completedEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr); }
  ~ActivationHandler() {
    if (completedEvent) CloseHandle(completedEvent);
  }

  // ActivateAudioInterfaceAsync chama esse handler de uma thread/apartment
  // diferente da que o criou. Sem declarar suporte a IAgileObject (uma
  // interface marcadora, sem metodos proprios — so avisa o COM "pode me
  // chamar de qualquer thread, nao precisa de proxy"), a ativacao falha
  // direto com E_ILLEGAL_METHOD_CALL (0x8000000E), sem nem chegar a
  // considerar o pid/processo.
  STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler) ||
        riid == __uuidof(IAgileObject)) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&refCount_); }
  STDMETHODIMP_(ULONG) Release() override {
    ULONG r = InterlockedDecrement(&refCount_);
    if (r == 0) delete this;
    return r;
  }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    IUnknown* rawInterface = nullptr;
    HRESULT hrActivateResult = E_FAIL;
    HRESULT hr = operation->GetActivateResult(&hrActivateResult, &rawInterface);

    if (SUCCEEDED(hr)) hr = hrActivateResult;
    if (SUCCEEDED(hr) && rawInterface) {
      hr = rawInterface->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&audioClient));
    }
    if (rawInterface) rawInterface->Release();

    activateHr = hr;
    SetEvent(completedEvent);
    return S_OK;
  }

  HANDLE completedEvent = nullptr;
  IAudioClient* audioClient = nullptr;
  HRESULT activateHr = E_FAIL;

 private:
  LONG refCount_ = 1;
};

void LogError(const wchar_t* what, HRESULT hr) {
  fwprintf(stderr, L"loopback_helper: %ls falhou (0x%08lx)\n", what, static_cast<unsigned long>(hr));
  fflush(stderr);
}

}  // namespace

int wmain(int argc, wchar_t* argv[]) {
  if (argc < 3) {
    fwprintf(stderr, L"uso: loopback_helper.exe exclude <pid> | loopback_helper.exe include-window <hwnd>\n");
    return 1;
  }

  // Preenchido direto na struct de ativacao (em vez de guardar numa
  // variavel local do tipo do enum) pra nao depender de como o SDK exporta
  // o nome do tipo — so os valores do enum (PROCESS_LOOPBACK_MODE_*) e os
  // campos da struct precisam existir, igual o resto do arquivo ja usa.
  AUDIOCLIENT_ACTIVATION_PARAMS activationParams = {};
  activationParams.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;

  if (wcscmp(argv[1], L"exclude") == 0) {
    // Grava tudo, exceto o pid dado (+ seus filhos) — usado pra "audio do
    // sistema, menos a propria chamada".
    activationParams.ProcessLoopbackParams.TargetProcessId = static_cast<DWORD>(_wtoi(argv[2]));
    activationParams.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;
  } else if (wcscmp(argv[1], L"include-window") == 0) {
    // Grava so o processo dono da janela dada (+ filhos) — usado pra
    // "audio de um app/jogo especifico". O HWND vem do id que o
    // desktopCapturer do Electron devolve ("window:<hwnd>:<indice>").
    HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(_wtoi64(argv[2])));
    DWORD ownerPid = 0;
    if (!hwnd || !GetWindowThreadProcessId(hwnd, &ownerPid) || ownerPid == 0) {
      fwprintf(stderr, L"loopback_helper: nao foi possivel achar o processo dono dessa janela\n");
      return 2;
    }
    activationParams.ProcessLoopbackParams.TargetProcessId = ownerPid;
    activationParams.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  } else {
    fwprintf(stderr, L"loopback_helper: modo desconhecido '%ls'\n", argv[1]);
    return 1;
  }

  // STA, nao MTA: ActivateAudioInterfaceAsync devolve E_ILLEGAL_METHOD_CALL
  // direto (sincrono, antes de qualquer callback) se a thread chamadora nao
  // estiver numa apartment de thread unica. O handler ainda declara suporte
  // a IAgileObject (ver ActivationHandler::QueryInterface) pra evitar
  // deadlock quando o callback de conclusao chega numa thread MTA do
  // sistema de audio.
  HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(hr)) {
    LogError(L"CoInitializeEx", hr);
    return 2;
  }

  HMODULE mmdevapi = LoadLibraryW(L"Mmdevapi.dll");
  if (!mmdevapi) {
    fwprintf(stderr, L"loopback_helper: nao foi possivel carregar Mmdevapi.dll\n");
    CoUninitialize();
    return 2;
  }
  auto activateFn =
      reinterpret_cast<ActivateAudioInterfaceAsyncFn>(GetProcAddress(mmdevapi, "ActivateAudioInterfaceAsync"));
  if (!activateFn) {
    fwprintf(stderr, L"loopback_helper: ActivateAudioInterfaceAsync indisponivel (Windows antigo demais)\n");
    CoUninitialize();
    return 2;
  }

  PROPVARIANT activateParamsVariant;
  PropVariantInit(&activateParamsVariant);
  activateParamsVariant.vt = VT_BLOB;
  activateParamsVariant.blob.cbSize = sizeof(activationParams);
  activateParamsVariant.blob.pBlobData = reinterpret_cast<BYTE*>(&activationParams);

  auto* handler = new ActivationHandler();
  IActivateAudioInterfaceAsyncOperation* asyncOp = nullptr;

  hr = activateFn(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &activateParamsVariant, handler,
                   &asyncOp);
  if (FAILED(hr)) {
    LogError(L"ActivateAudioInterfaceAsync", hr);
    handler->Release();
    CoUninitialize();
    return 2;
  }

  // CoWaitForMultipleHandles em vez de WaitForSingleObject: numa apartment
  // STA, o callback de conclusao pode chegar via mensagem da fila da
  // propria thread — um wait "cru" travaria pra sempre esperando um evento
  // que so e sinalizado depois que essa mensagem for bombeada.
  DWORD waitIndex = 0;
  HANDLE completedEvent = handler->completedEvent;
  HRESULT waitHr = CoWaitForMultipleHandles(COWAIT_DISPATCH_CALLS, kActivationTimeoutMs, 1, &completedEvent, &waitIndex);
  DWORD waitResult = SUCCEEDED(waitHr) ? WAIT_OBJECT_0 : WAIT_TIMEOUT;
  if (waitResult != WAIT_OBJECT_0 || FAILED(handler->activateHr) || !handler->audioClient) {
    LogError(L"ativacao do loopback de processo", handler->activateHr);
    if (asyncOp) asyncOp->Release();
    handler->Release();
    CoUninitialize();
    return 2;
  }

  IAudioClient* audioClient = handler->audioClient;
  audioClient->AddRef();
  if (asyncOp) asyncOp->Release();
  handler->Release();

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = static_cast<WORD>(format.nChannels * format.wBitsPerSample / 8);
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
  format.cbSize = 0;

  // AUTOCONVERTPCM: deixa o motor de audio converter pro formato fixo que
  // pedimos, ja que o loopback de processo nao aceita negociar formato via
  // GetMixFormat (nao implementado nesse tipo de ativacao).
  hr = audioClient->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
      kBufferDuration100ns, 0, &format, nullptr);
  if (FAILED(hr)) {
    LogError(L"IAudioClient::Initialize", hr);
    audioClient->Release();
    CoUninitialize();
    return 3;
  }

  HANDLE audioEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  hr = audioClient->SetEventHandle(audioEvent);
  if (FAILED(hr)) {
    LogError(L"SetEventHandle", hr);
    audioClient->Release();
    CloseHandle(audioEvent);
    CoUninitialize();
    return 3;
  }

  IAudioCaptureClient* captureClient = nullptr;
  hr = audioClient->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(&captureClient));
  if (FAILED(hr)) {
    LogError(L"GetService(IAudioCaptureClient)", hr);
    audioClient->Release();
    CloseHandle(audioEvent);
    CoUninitialize();
    return 3;
  }

  _setmode(_fileno(stdout), _O_BINARY);

  StreamHeader header = {{'G', 'S', 'L', '1'}, kSampleRate, kChannels, kBitsPerSample, 0};
  fwrite(&header, sizeof(header), 1, stdout);
  fflush(stdout);

  hr = audioClient->Start();
  if (FAILED(hr)) {
    LogError(L"IAudioClient::Start", hr);
    captureClient->Release();
    audioClient->Release();
    CloseHandle(audioEvent);
    CoUninitialize();
    return 3;
  }

  std::vector<BYTE> silence;
  bool running = true;
  while (running) {
    DWORD waitAudio = WaitForSingleObject(audioEvent, 2000);
    if (waitAudio != WAIT_OBJECT_0) continue;

    UINT32 packetLength = 0;
    hr = captureClient->GetNextPacketSize(&packetLength);
    if (FAILED(hr)) break;

    while (packetLength != 0) {
      BYTE* data = nullptr;
      UINT32 numFrames = 0;
      DWORD flags = 0;
      hr = captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr)) {
        running = false;
        break;
      }

      size_t bytes = static_cast<size_t>(numFrames) * format.nBlockAlign;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        if (silence.size() < bytes) silence.resize(bytes, 0);
        fwrite(silence.data(), 1, bytes, stdout);
      } else if (data) {
        fwrite(data, 1, bytes, stdout);
      }

      captureClient->ReleaseBuffer(numFrames);

      if (ferror(stdout)) {
        running = false;
        break;
      }
      fflush(stdout);

      hr = captureClient->GetNextPacketSize(&packetLength);
      if (FAILED(hr)) {
        running = false;
        break;
      }
    }

    if (ferror(stdout)) running = false;
  }

  audioClient->Stop();
  captureClient->Release();
  audioClient->Release();
  CloseHandle(audioEvent);
  CoUninitialize();
  return 0;
}
