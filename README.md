# DuStats

Estatísticas ao vivo de futebol amador para transmissão no OBS.

Você aponta os lances num celular; o placar, o selo de gol e o painel de
estatísticas do intervalo entram no ar sozinhos, sem ninguém tocar no OBS
durante o jogo.

```
celular do apontador  ──►  DuStats (PC do OBS)  ──►  4 overlays no OBS
   botões de 1 toque        Node.js + WebSocket        placar · gol · intervalo · resumo
```

## O que entra no ar

| Overlay | Quando aparece | O que mostra |
|---|---|---|
| `placar.html` | modo **Jogo** | Placar, cronômetro, acréscimos e barra de posse |
| `evento.html` | sozinho, por 7 s | Selo de gol e de cartão, com o placar atualizado |
| `intervalo.html` | modo **Intervalo** | Carrossel: comparativo → mapa de chutes → pressão → gols e cartões |
| `resumo.html` | modo **Resumo** | O mesmo carrossel com o jogo inteiro, mais a exportação |

Os quatro ficam na **mesma cena do OBS o tempo todo**. Cada um decide sozinho
se está no ar, olhando o modo que o celular mandou — por isso não existe troca
de fonte no OBS no meio da transmissão.

## Instalar

Precisa de [Node.js 18 ou mais novo](https://nodejs.org). Uma vez só:

```bash
npm install
```

## Rodar

```bash
npm start
```

O terminal imprime os endereços, já com o IP da sua rede:

```
  PAINEL DO APONTADOR (abra no celular, na mesma rede):
     http://192.168.0.12:4400/control/

  OVERLAYS — adicione como Fonte de Navegador no OBS, 1920x1080:
     placar    http://192.168.0.12:4400/overlay/placar.html
     ...
```

Deixe essa janela aberta durante todo o jogo.

## Montar no OBS (uma vez só)

Para cada um dos quatro overlays:

1. **+** → **Fonte de Navegador** → nome (ex.: `DuStats placar`)
2. URL: a que o terminal imprimiu
3. Largura **1920**, altura **1080**
4. Marque **Desligar a fonte quando não estiver visível**
5. Deixe **Atualizar navegador quando a cena ficar ativa** desmarcado

Coloque os quatro na mesma cena, na ordem: `placar`, `evento`, `intervalo`,
`resumo` (o resumo por cima). O fundo já é transparente.

### Ajustes por URL

| Parâmetro | Efeito |
|---|---|
| `placar.html?pos=tr` | Move o placar de canto: `tl`, `tr`, `bl`, `br` |
| `placar.html?posse=0` | Esconde a barra de posse |
| `evento.html?segundos=10` | Muda quanto tempo o selo fica no ar |
| `resumo.html?exportar=1` | Mostra os botões de exportação (abra no navegador, **não** no OBS) |

## Durante o jogo

Abra `/control/` no celular. Antes do apito:

1. **Ajustes** → nomes, siglas, cores e escudos dos dois times
2. **No ar** → modo **Jogo**
3. **Próximo período** para sair do pré-jogo e entrar no 1º tempo
4. **▶** quando a bola rolar

Apontando:

- **Posse** é o único botão que fica pressionado — troque a cada mudança de
  posse. É dele que sai a porcentagem.
- **Gol** já entra no placar com um toque. A tela do campo que abre depois é
  opcional: marque onde saiu se der tempo, ou feche.
- **Finalização** pede o desfecho; o local no campo é opcional.
- **Desfazer** apaga o último lance (ignora as trocas de posse, que você corrige
  só tocando de novo). Dá para apagar qualquer lance pela lista de baixo.
- No intervalo: **No ar** → **Intervalo**. O carrossel roda sozinho a cada 12 s;
  as setas seguram ou pulam um slide.
- No fim: **Próximo período** até `Fim de jogo`, e **No ar** → **Resumo**.

### Atalhos de teclado

Para quem aponta no mesmo PC do OBS:

| Tecla | Ação | | Tecla | Ação |
|---|---|---|---|---|
| `espaço` | Inicia/pausa o relógio | | `Q` / `P` | Gol casa / fora |
| `Z` | Desfazer | | `W` / `O` | Finalização casa / fora |
| `←` `↓` `→` | Posse casa / parada / fora | | `E` / `I` | Escanteio casa / fora |
| | | | `R` / `U` | Falta casa / fora |

## Depois do jogo

Abra `http://SEU-IP:4400/overlay/resumo.html?exportar=1` no navegador:

- **PNG quadrado** 1080×1080, pronto para o Instagram ou o grupo do WhatsApp
- **Resumo CSV** e **Lances CSV** (abrem direto no Excel em português)
- **Backup JSON** da partida inteira

## Testar sem jogo

```bash
npm start                      # numa aba
npm run simular                # noutra: 1º tempo pronto, painel do intervalo no ar
npm run simular -- --completo  # 90 minutos + resumo final
npm run simular -- --vivo      # jogo correndo agora, para ver as animações
```

O simulador cria uma partida fictícia com horários retroativos, então o painel
do intervalo aparece com 45 minutos de estatísticas na hora — dá para ajustar
os overlays em segundos em vez de esperar um jogo.

```bash
npm test                       # testes do relógio, das estatísticas e do estado
```

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `4400` | Porta do servidor |
| `DUSTATS_TOKEN` | vazio | Se definida, exige o cabeçalho `x-dustats-token` para gravar |
| `DUSTATS_ESPORTE` | `futebol` | Nome do arquivo em `config/` |

`config/futebol.json` define os períodos e os tipos de lance. `config/partida.json`
guarda os times (o painel escreve nele sozinho).

## Onde ficam os dados

Cada partida vira um arquivo em `data/matches/`, **gravado a cada lance**. Se o
servidor cair no meio do jogo, `npm start` volta exatamente no ponto em que
parou, com o relógio certo — o tempo é reconstruído dos horários dos eventos,
não de um cronômetro em memória.

Os arquivos antigos ficam guardados; **Começar partida nova** no painel só
arquiva o atual.

## Se algo der errado

**O celular não abre o painel.** Confira que ele está no mesmo Wi-Fi. Se ainda
assim não abrir, é o firewall do Windows: libere o Node.js na rede privada.

**O overlay ficou preto no OBS.** Ele está fora do modo dele — verifique a aba
**No ar** do painel. O `intervalo.html` só aparece no modo Intervalo.

**O cronômetro travou.** O relógio do overlay continua contando no navegador
mesmo sem rede; se o placar parou de atualizar, o painel mostra um aviso
vermelho de "sem conexão".

**Perdi um lance porque o Wi-Fi caiu.** Não perdeu: o painel guarda os lances no
próprio celular e manda todos assim que a conexão volta.

**Mudei o escudo e o OBS mostra o antigo.** Clique com o botão direito na fonte
→ **Atualizar**.

## Se um dia entrar visão computacional

O sistema já está preparado, mas nada de detecção automática está implementado.
Quatro decisões deixam esse caminho aberto:

1. `POST /api/eventos` aceita eventos externos com `source: "cv"` — o mesmo
   formato do painel.
2. Posse de bola é gravada como **eventos de mudança**, exatamente o que um
   detector produz.
3. As coordenadas do mapa de chutes já são normalizadas 0–1 no espaço do campo,
   que é a saída de uma homografia.
4. `server/stats.js` não sabe de onde veio nenhum evento.

**Restrição de câmera, e ela é decisiva:** o módulo de visão precisa consumir
uma **câmera fixa e aberta, via RTSP, em outro processo**. A câmera de jogo que
se move e passa por mesa de corte é inutilizável para isso — cada corte, zoom e
pan quebra tanto o rastreio dos jogadores quanto a homografia do gramado.

E vale saber o limite antes de investir: posse de bola, mapa de calor e radar
tático são viáveis; **gol, escanteio, falta e cartão não são** — mesmo os
modelos de ponta erram demais para uma transmissão ao vivo, e esses lances
continuariam precisando de um toque no painel.

Referências úteis: [roboflow/sports](https://github.com/roboflow/sports) (MIT,
modelos pré-treinados de jogador, bola e keypoints do campo) e
[soccer-video-analytics](https://github.com/Tony-Luna/soccer-video-analytics).

## Como é feito por dentro

Duas decisões explicam quase todo o código:

**Tudo é evento.** Nenhuma estatística é um contador que sobe. O jogo é uma
lista de eventos imutáveis, e placar, posse, precisão e pressão são *derivados*
dela a cada leitura (`server/stats.js`). É isso que faz o **desfazer** custar
uma linha, o reinício do servidor ser exato e a visão computacional caber
depois sem reescrever nada.

**Nada depende da internet.** Sem CDN, sem fonte do Google, sem biblioteca de
gráficos. Os gráficos são SVG escrito à mão e o card do Instagram é desenhado
direto em `<canvas>`. No campo o PC pode estar sem rede, e um overlay que entra
no ar sem fonte não tem conserto no meio do jogo.

As dependências de produção são duas: `express` e `ws`.

```
server/    clock.js (tempo)  stats.js (derivação)  state.js (partida)
           storage.js (disco)  export.js (CSV)  index.js (HTTP + WebSocket)
public/    shared/ (bus, campo, painéis, cartão)  control/  overlay/
config/    futebol.json (regras do esporte)  partida.json (times)
```
