# DuStats

Estatísticas ao vivo de futebol amador para transmissão no OBS.

Você aponta os lances num celular e as estatísticas entram no ar sozinhas —
uma faixa no rodapé durante o jogo, um painel em tela cheia no intervalo — sem
ninguém tocar no OBS.

```
celular do apontador  ──►  DuStats (PC do OBS)  ──►  2 overlays no OBS
   botões de 1 toque        Node.js + WebSocket       faixa (rodapé) · intervalo (tela cheia)
```

## O DuStats só faz estatística

Ele foi feito para conviver com o **[Placar PRO](https://painelplacarpro.com.br/)**,
não para substituí-lo. A divisão é rígida de propósito: dois sistemas
desenhando a mesma coisa é o caminho mais curto para dois placares no ar e dois
cronômetros divergentes.

| O Placar PRO faz | O DuStats faz |
|---|---|
| Placar, cronômetro, acréscimos | Posse de bola |
| Escalações | Finalizações, chutes no gol, precisão |
| Replays e melhores momentos | Escanteios, faltas, impedimentos, defesas |
| Overlay de gol e cartão | Mapa de chutes e índice de pressão |

Por isso o DuStats **não tem overlay de placar nem selo de gol**. Eles
existiram e foram removidos justamente para não conflitar. Se um dia você
parar de usar o Placar PRO, dá para trazê-los de volta:

```bash
git checkout af5def7 -- public/overlay/placar.html public/overlay/evento.html
```

## O que entra no ar

| Overlay | Quando aparece | O que mostra |
|---|---|---|
| `faixa.html` | quando você chama, por 10 s | Uma estatística no rodapé: posse, finalizações, chutes no gol, escanteios, faltas ou cartões |
| `intervalo.html` | modo **Intervalo** | Card flutuante no centro: comparativo → mapa de chutes → pressão → gols e cartões |
| `resumo.html` | modo **Resumo** | O mesmo carrossel com o jogo inteiro, mais a exportação |

Os dois primeiros ficam na **mesma cena do OBS o tempo todo** e decidem sozinhos
quando aparecer, obedecendo o celular. O `resumo.html` é para abrir no navegador
depois do jogo.

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
     faixa     http://192.168.0.12:4400/overlay/faixa.html   (rodapé, sob demanda)
     intervalo http://192.168.0.12:4400/overlay/intervalo.html   (tela cheia)
```

Deixe essa janela aberta durante todo o jogo.

## Montar no OBS (uma vez só)

Para cada um dos dois overlays:

1. **+** → **Fonte de Navegador** → nome (ex.: `DuStats faixa`)
2. URL: a que o terminal imprimiu
3. Largura **1920**, altura **1080**
4. Marque **Desligar a fonte quando não estiver visível**
5. Deixe **Atualizar navegador quando a cena ficar ativa** desmarcado

### A ordem das fontes importa

Na mesma cena, de cima para baixo:

```
1. Placar PRO              canto superior esquerdo
2. DuStats — intervalo     card flutuante no centro
3. DuStats — faixa         rodapé
4. Câmera
```

O **Placar PRO fica por cima**. O painel do intervalo não é mais tela cheia:
é um card flutuante posicionado abaixo do canto do placar, e ele escurece de
leve o resto da imagem para destacar. Deixando o Placar PRO acima, o placar
continua nítido durante todo o intervalo em vez de ficar sob o escurecimento.

A faixa mora no rodapé e o placar no topo — nunca se tocam. O fundo dos dois
overlays do DuStats já é transparente.

### Ajustes por URL

| Parâmetro | Efeito |
|---|---|
| `faixa.html?pos=bc` | Move a faixa no rodapé: `bl` (padrão), `bc`, `br` |
| `faixa.html?baixo=200` | Sobe a faixa, se você usa o lower third do Placar PRO no rodapé |
| `faixa.html?segundos=8` | Muda quanto tempo a faixa fica no ar |
| `resumo.html?exportar=1` | Mostra os botões de exportação (abra no navegador, **não** no OBS) |

### Identidade visual

Os gráficos usam a mesma linguagem do overlay do Placar PRO — base navy em
blocos, faixa clara no topo de cada peça, texto branco pesado — para as duas
coisas parecerem do mesmo pacote gráfico em vez de dois sistemas colados.

O **verde do Marrentão** é a cor de acento: aparece na faixa do topo, no rótulo
da faixa do rodapé e nos pontinhos do carrossel. Ele **nunca entra nos números**,
que continuam falando na cor dos times — jogar uma terceira cor no meio dos
dados confunde a leitura justo onde ela precisa ser instantânea.

Para casar exatamente com o verde do seu overlay: **Ajustes → Cor da
transmissão**. Tire um print do Placar PRO no ar e pegue a cor com um
conta-gotas.

## Durante o jogo

Abra `/control/` no celular. Antes do apito:

1. **Ajustes** → nomes, siglas, cores e escudos dos dois times
2. **No ar** → **Jogo** (deixa a tela livre; só a faixa aparece, quando você chamar)
3. **Próximo período** para sair do pré-jogo e entrar no 1º tempo
4. **▶** junto com o cronômetro do Placar PRO

Apontando:

- **Posse** é o único botão que fica pressionado — troque a cada mudança de
  posse. É dele que sai a porcentagem.
- **Gol** já entra com um toque; registre também no Placar PRO, que é quem
  mostra o placar no ar. A tela do campo que abre depois é opcional.
- **Finalização** pede o desfecho; o local no campo é opcional.
- **Desfazer** apaga o último lance (ignora as trocas de posse, que você corrige
  só tocando de novo). Dá para apagar qualquer lance pela lista de baixo.

Pondo estatística no ar:

- Aba **No ar** → toque numa das seis estatísticas para ela subir no rodapé por
  10 s. Botão apagado é estatística que ainda não aconteceu no jogo.
- **Rodar sequência** encadeia posse → finalizações → escanteios, 8 s cada.
  Boa para atendimento médico e outras paradas longas.
- No intervalo: **No ar** → **Intervalo**. O carrossel roda sozinho a cada 12 s;
  as setas seguram ou pulam um slide.
- No fim: **Próximo período** até `Fim de jogo`, e **No ar** → **Resumo**.

### Sincronizar o relógio com o Placar PRO

O DuStats tem cronômetro próprio porque posse de bola é medida em tempo e cada
lance precisa do minuto em que caiu. Mas quem aparece na tela é o do Placar PRO,
e os dois se afastam alguns segundos ao longo do jogo — foram iniciados por
dedos diferentes.

Na aba **No ar**, digite o tempo que está no Placar PRO e toque em **Ajustar**.
Errou o valor? Ajuste de novo — o valor é absoluto, então o segundo substitui o
primeiro. O botão **Desfazer** não mexe em relógio de propósito: ele é para
apagar lance errado, e se pegasse o ajuste você apagaria um lance sem querer.

Isso move só o rótulo de minuto. **Nenhuma estatística já medida muda**: a posse
de bola e as janelas do gráfico de pressão correm num relógio interno separado,
que o ajuste não toca — corrigir um rótulo mexendo nessa base estragaria número
que ninguém iria conferir.

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

**O overlay ficou preto no OBS.** Está tudo certo: os dois só desenham quando
têm o que mostrar. O `intervalo.html` fica vazio fora do modo Intervalo, e a
`faixa.html` só aparece nos 10 s depois de você chamar uma estatística.

**Chamei a faixa e não apareceu nada.** Ou o painel está em modo Intervalo ou
Resumo (a tela cheia esconde a faixa de propósito), ou a estatística ainda não
aconteceu no jogo — nesse caso o botão no celular está apagado.

**O Placar PRO some no intervalo.** É o esperado: o painel de estatísticas em
tela cheia fica acima dele na ordem das fontes. Se acontecer o contrário — o
placar flutuando por cima das estatísticas — a ordem está invertida.

**O minuto do DuStats não bate com o do Placar PRO.** Normal, são cronômetros
independentes. Aba **No ar** → digite o tempo do Placar PRO → **Ajustar**.

**O cronômetro travou.** O relógio continua contando no navegador mesmo sem
rede; se o painel parou de atualizar, ele mostra um aviso vermelho de
"sem conexão".

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

**Um número, um lugar.** A faixa do rodapé não recalcula nada: ela procura a
linha pelo rótulo na mesma lista comparativa que alimenta o painel do intervalo
(`linhasComparativas()`, em `server/stats.js`). Assim é impossível o rodapé
mostrar 58% de posse e o painel do intervalo mostrar 57%.

As dependências de produção são duas: `express` e `ws`.

```
server/    clock.js (tempo)  stats.js (derivação)  state.js (partida)
           storage.js (disco)  export.js (CSV)  index.js (HTTP + WebSocket)
public/    shared/ (bus, campo, painéis, cartão)  control/  overlay/
config/    futebol.json (regras do esporte)  partida.json (times)
```
