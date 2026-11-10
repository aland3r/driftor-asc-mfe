# Driftor ASC · MFE

Microfrontend do **Driftor ASC**, entrega 3 de Arquitetura e Soluções Cloud (PUCPR). É a interface em React: envia logs de eventos, mostra o grafo do processo e as análises de desvio de desempenho. Fala só com o [BFF](https://github.com/aland3r/driftor-asc-bff), sempre pelo Azure API Management.

## Na nuvem

| | URL |
|---|---|
| Aplicação | https://driftor-asc-mfe.vercel.app |
| API usada (API Management) | https://driftor-asc-apim.azure-api.net/api |

## Telas

| Rota | O que faz | Chamadas ao BFF |
|---|---|---|
| `/` | Landing: o que é o produto, links dos repositórios e do vídeo, e o botão **Começar a usar** | nenhuma |
| `/app` | Dashboard: processos e análises, com renomear e excluir em cada cartão | `GET /overview` |
| `/processos/:id` | Grafo do processo (DFG), densidade, detalhe da atividade, variantes e traces, **Operações** e **Gerar Análise de Desvios** | `GET /processes/{id}`, `GET /processes/{id}/traces`, `PUT /processes/{id}/operations` |
| `/analises/:id` | Série original e tratada, desvios, segmentos e traces, detalhe de cada desvio | `GET /aggregated-data?analysisId=` |
| `/documentacao` | O arc42 do projeto, com índice das seções e "Nesta página" | `GET /documentation/arc42` |

Os dois CRUDs completos:

| | Create | Read | Update | Delete |
|---|---|---|---|---|
| Processo (MS1 pmining) | **Novo processo**: envio do log e mapeamento dos eventos para atividades | Dashboard e tela do processo | nome no cartão ou no título; **Operações** refaz o mapeamento | no cartão ou no cabeçalho, apaga também as análises do processo |
| Análise (MS2 ipdd) | **Gerar Análise de Desvios**: o ipdd grava e pede o ADWIN à Function pela fila | Dashboard e tela da análise | nome no cartão ou no título | no cartão ou no cabeçalho |

A lista de traces é um componente só: agrupa por **variante** no processo e por **segmento** (trecho entre desvios) na análise, com o mesmo `CASE-0001`, a mesma duração (`58 s`, `1 min 23 s`) e as mesmas cores de status.

## Arquitetura

```
src/
  lib/         formatos (CASE-0001, durações, %) sem React
  api/         cliente HTTP do BFF e tipos do contrato; único ponto de rede
  components/  cabeçalho, modal, lista de traces, controles
  features/    grafo (dagre + setas por frequência), mapeamento de operações, nova análise, Mermaid do arc42
  pages/       uma tela por rota, carregada sob demanda
```

Os testes de arquitetura rodam o [dependency-cruiser](.dependency-cruiser.cjs): `lib` e `api` não importam React nem telas, `components` não conhece `features` nem `pages`, uma tela não importa outra e não há ciclos.

## Tecnologias

React 19, TypeScript, Vite, React Router, Recharts, dagre, Mermaid, react-markdown, lucide-react, Vitest, Testing Library, dependency-cruiser, GitHub Actions, Vercel.

## Rodar localmente

```bash
npm ci
npm test
cp .env.example .env   # VITE_API_URL aponta para o APIM ou para um BFF local
npm run dev            # http://localhost:5173
```

## Pipeline

A cada push na `main`, o GitHub Actions roda os testes e o build; a Vercel publica a `main` pela integração com o GitHub. Variáveis na Vercel: `VITE_API_URL`, `VITE_API_KEY` (chave do produto no API Management) e `VITE_VIDEO_URL`.

## Grupo

- Alander Menezes Arantes de Ávila
- Emanuelle Skolut Jose
