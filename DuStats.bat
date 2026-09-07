@echo off
rem ---------------------------------------------------------------------------
rem  DuStats — inicializacao por duplo clique no Windows.
rem
rem  Procura o Node em duas ordens: primeiro o portatil dentro da propria pasta
rem  (node\node.exe), depois o instalado no sistema. Assim a mesma pasta serve
rem  tanto para o PC de casa quanto para o pendrive levado ao campo.
rem
rem  Sem acentos de proposito: o console do Windows nem sempre esta em UTF-8 e
rem  o texto sairia embaralhado justo na hora em que algo deu errado.
rem ---------------------------------------------------------------------------

setlocal
title DuStats
cd /d "%~dp0"

rem Node portatil na pasta tem prioridade sobre o do sistema: se voce trouxe a
rem pasta inteira, e ele que voce testou.
if exist "node\node.exe" goto :portatil

where node >nul 2>nul
if errorlevel 1 goto :sem_node
set "NODE=node"
goto :subir

:portatil
set "NODE=%~dp0node\node.exe"
goto :subir

:subir
rem Faz o servidor abrir o painel no navegador assim que subir.
set "DUSTATS_ABRIR=1"

echo.
echo   Iniciando o DuStats...
echo.
"%NODE%" server\index.js

echo.
echo   O DuStats foi encerrado.
echo   Feche esta janela ou pressione uma tecla.
pause >nul
exit /b 0

:sem_node
echo.
echo   =====================================================================
echo    O Node.js nao foi encontrado neste computador.
echo   =====================================================================
echo.
echo    Voce tem duas saidas:
echo.
echo    1. Instalar o Node.js (uma vez so, ~30 MB):
echo       https://nodejs.org  -  baixe a versao LTS e instale
echo.
echo    2. Usar a pasta portatil, que ja traz o Node dentro dela e nao
echo       precisa instalar nada. Para monta-la, num PC que tenha Node:
echo          npm run portatil
echo.
echo   =====================================================================
echo.
pause >nul
exit /b 1
