const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gera so HTML/JS/CSS estatico -- sem rota de API nem middleware (o
  // proprio Next nao deixa misturar isso com output "export"). E esse
  // pacote que o instalador do Electron vai empacotar; a API continua
  // sendo a mesma do site, chamada remotamente (ver src/lib/apiUrl.ts).
  output: "export",
  images: {
    // O otimizador de imagem do Next precisa de um servidor rodando --
    // nao existe em export estatico. As fotos (Google ou upload) ja vem
    // de URL absoluta, o navegador busca direto sem otimizacao.
    unoptimized: true,
  },
  experimental: {
    // Permite importar arquivos de fora da pasta desse projeto
    // (../src/components/..., ../src/lib/...) -- e assim que reaproveitamos
    // os componentes do site sem duplicar nada. Maior incerteza do plano:
    // se isso nao funcionar direito com o Tailwind/next/image, o plano B e
    // copiar so os componentes dessa fatia em vez de importar.
    externalDir: true,
  },
  webpack: (config) => {
    // Os componentes importados de ../src usam `next-auth/react`
    // (useSession/signIn/signOut/SessionProvider) pensando em sessao por
    // cookie -- aqui a sessao vem de token (ver plano). Em vez de tocar
    // no codigo compartilhado, trocamos so o modulo por um substituto com
    // a mesma assinatura (ver shims/next-auth-react.tsx), so dentro
    // desse build.
    config.resolve.alias["next-auth/react"] = path.resolve(__dirname, "shims/next-auth-react.tsx");
    return config;
  },
};

module.exports = nextConfig;
