/**
 * Regras de arquitetura do microfrontend (camadas de dentro para fora):
 * lib e api não conhecem React; components não conhecem telas nem features;
 * features não conhecem telas; ninguém chama os microsserviços direto (só o BFF, via api/client).
 */
module.exports = {
  forbidden: [
    { name: 'lib-pura', severity: 'error', from: { path: '^src/lib' }, to: { path: '^src/(api|components|features|pages)|node_modules/react' } },
    { name: 'api-sem-ui', severity: 'error', from: { path: '^src/api' }, to: { path: '^src/(components|features|pages)|node_modules/react' } },
    { name: 'components-sem-telas', severity: 'error', from: { path: '^src/components' }, to: { path: '^src/(features|pages)' } },
    { name: 'features-sem-telas', severity: 'error', from: { path: '^src/features' }, to: { path: '^src/pages' } },
    { name: 'paginas-isoladas', severity: 'error', comment: 'Uma tela não importa outra; o roteamento fica no App.', from: { path: '^src/pages/([^/]+)\\.tsx$' }, to: { path: '^src/pages/[^/]+\\.tsx$', pathNot: '^src/pages/$1\\.tsx$' } },
    { name: 'fetch-so-no-client', severity: 'error', comment: 'Só src/api/client.ts fala com a rede.', from: { path: '^src', pathNot: '^src/api/client\\.ts$' }, to: { path: 'node_modules/(axios|ky)' } },
    { name: 'sem-ciclos', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
  },
}
