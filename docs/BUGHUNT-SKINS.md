# Bughunt das skins — 11/09/2026

Revisão do commit `aacd0b5`, que adicionou Cápsulas, Costura, Noturno e Diurno,
na branch `claude/game-stats-broadcast-uubsj3`.

Seis problemas confirmados foram corrigidos. A atualização expôs falhas de
contraste nas skins claras e tornou mais perceptíveis problemas anteriores
de atualização e animação.

| Prioridade | Problema e reprodução | Correção | Origem |
| --- | --- | --- | --- |
| Alta | Em Cápsulas, Costura ou Diurno, abrir Pressão ou Gols e cartões: minutos e eixos usam branco sobre fundo claro. Totais e símbolos da legenda do mapa também mantêm branco fixo. | Gráficos e legenda usam as cores de texto da skin. | Regressão exposta pelos novos fundos claros. |
| Alta | Deixar Comparativo no ar e corrigir uma estatística: os números do corpo permanecem antigos. No mapa, corrigir a posição de um chute sem mudar a quantidade também é ignorado. | O slide ativo acompanha seu conteúdo completo, incluindo correções; snapshots idênticos não redesenham. | Anterior à atualização. |
| Média | Alterar uma estatística com Costura ou Diurno no ar: o cabeçalho é reconstruído, reiniciando as animações dos escudos. | Cabeçalho e corpo têm controle de atualização separado. Correções do slide ativo não repetem sua entrada; voltar ao intervalo preserva a animação de entrada. | Reconstrução anterior; efeito acentuado pelas novas animações. |
| Média | Abrir `resumo.html?exportar=1`, depois trocar a skin ou corrigir o placar: a prévia PNG mantém a primeira imagem. | Prévia acompanha os dados e ignora resultados assíncronos antigos. Falhas permitem nova tentativa; downloads simultâneos são bloqueados. | Anterior à atualização, exposto pela troca de skins. |
| Média | Abrir a página de exportação durante o modo Jogo: a primeira atualização esconde o painel de resumo. | A página de exportação permanece visível; o overlay comum continua obedecendo ao modo de transmissão. | Anterior à atualização. |
| Alta, condicional | Se `os.networkInterfaces()` falhar, o servidor encerra durante a inicialização ou ao produzir um snapshot. A falha `uv_interface_addresses` ocorreu no ambiente de teste. | O servidor continua atendendo localmente, sem anunciar um endereço de rede que não conseguiu descobrir. | Anterior à atualização; depende do ambiente. |

Também foi corrigida a indicação de “cinco” skins no seletor: agora são nove.

## Verificação

- A versão recebida passou nos 81 testes existentes. Os primeiros nove testes
  de reprodução adicionados falharam antes das correções e passaram depois.
- Suíte final local: **94 testes passando**, incluindo 13 novos. Execução com
  Node 24.19.0, sem dependências de produção.
- Testes de renderização executam o JavaScript real dos painéis e calculam o
  contraste dos rótulos SVG com as paletas de Cápsulas, Costura e Diurno.
- Testes de eventos cobrem atualização do carrossel, entrada/saída por modo,
  prévia PNG, resultado assíncrono fora de ordem, falha recuperável e download
  em andamento.
- Teste de inicialização abre o servidor real com falha de enumeração de rede
  simulada e confirma resposta HTTP e estado da partida.
- `node ferramentas/fumaca.mjs`: passou, incluindo páginas, skins, escudos,
  gravação de gol, persistência e bloqueio de caminhos fora da pasta pública.
- `npm run empacotar` e fumaça do bundle copiado para uma pasta isolada:
  passaram, com 24 arquivos públicos/configuração embutidos.

## Limites da revisão

O navegador de teste bloqueou o acesso ao servidor local
(`ERR_BLOCKED_BY_CLIENT`). Esta revisão não certifica o acabamento visual,
as dimensões ou o tempo das animações no Chromium do OBS. Os testes de DOM
usam elementos mínimos para exercitar os scripts e não substituem layout de
navegador. O executável Windows também precisa ser aberto no computador da
transmissão para validar a experiência final.

Para a conferência no OBS em 1920 × 1080: percorrer os quatro slides nas nove
skins; corrigir estatísticas com um slide no ar; sair e voltar ao intervalo;
alternar skins com a exportação aberta e comparar a prévia com o PNG baixado.
Na Noturno, conferir especialmente o espaço dos mapas e suas legendas, que
não pôde ser medido no navegador nesta revisão.
