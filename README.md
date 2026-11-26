# Cabine Fotos

App de cabine fotográfica offline para estudo. Operado pela equipe em um celular Android por evento.

## Gerar o APK sem Android Studio

1. Crie um repositório no GitHub (pode ser privado) e envie esta pasta inteira.
2. Abra a aba **Actions** do repositório. O build **APK Android** roda sozinho a cada envio para a branch `main` (ou clique em *Run workflow*).
3. Quando terminar (cerca de 5 minutos), abra a execução e baixe o artefato **cabine-mude-apk**. Dentro do ZIP está o `app-debug.apk`.
4. Passe o APK para o celular e instale. O Android vai pedir para permitir a instalação de fontes desconhecidas.

## Gerar o APK com Android Studio

```
npm install
npm run android
```

No Android Studio: *Build > Build App Bundle(s) / APK(s) > Build APK(s)*.

## Totem (Cabine Totem)

O build **APK Android** gera dois arquivos: `cabine-celular-apk` (operador com celular) e `cabine-totem-apk` (autoatendimento em totem). Os dois instalam lado a lado e as atualizações instalam por cima.

- Câmera USB (Logitech MX Brio): escolhida sozinha; ajuste câmera, resolução, rotação e espelho em Ajustes.
- Área do operador: segure o canto superior esquerdo por 2 segundos e digite o PIN (padrão 1234).
- Ajustes > Diagnóstico: testa o aparelho, a câmera e o tempo de montagem; o relatório pode ser enviado.

## Estação de impressão (Windows)

Programa para o notebook ligado na impressora (testado para DNP DS-RX1HS). O totem e os celulares Android mandam as fotos pela rede, sem cabo.

1. Em Actions, abra a execução mais recente de "Estação de impressão (Windows)" e baixe o artefato `estacao-impressao-windows`.
2. Abra `EstacaoImpressao.exe` no notebook. Na primeira vez, o Windows pergunta sobre o firewall: permita em redes privadas.
3. Escolha a impressora da foto e, se quiser a tirinha cortada, uma cópia da DS-RX1HS com "2 inch cut" ativado.
4. No app, em Ajustes > Estação de impressão, digite o endereço mostrado no topo da estação (ex.: `192.168.0.10:8787`).

Não funciona no iPhone pelo app web: lá a impressão continua pela folha de compartilhar.

## iPhone (app web instalável)

1. No repositório: *Settings > Pages > Build and deployment > Source*: **GitHub Actions**.
2. O build **App web (iPhone)** publica em `https://<usuario>.github.io/<repositorio>/` a cada envio para a `main`.
3. No iPhone, abra o endereço no Safari, toque em *Compartilhar > Adicionar à Tela de Início* e abra pelo ícone.
4. Depois da primeira abertura funciona sem internet. Imprimir e Salvar abrem a folha de compartilhamento do iOS (AirPrint e Salvar Imagem).

## Testar no navegador

```
npm install
npm run dev
```

A câmera do navegador funciona em `localhost`. No navegador, imprimir abre a impressão do sistema e salvar baixa o arquivo.

## Molduras

PNG RGB com transparência total nas janelas das fotos, no tamanho exato do formato (300 dpi):

| Formato | Moldura | Pixels | Folha impressa |
|---|---|---|---|
| Foto lembrança retrato | 10 × 15 cm | 1181 × 1772 px | 1 por folha 10 × 15 |
| Foto lembrança paisagem | 15 × 10 cm | 1772 × 1181 px | 1 por folha 15 × 10 |
| Tirinha | 5 × 15 cm | 591 × 1772 px | 2 por folha 10 × 15 |
| Polaroid | 7,5 × 10 cm | 886 × 1181 px | 2 por folha 15 × 10 |

Margem de segurança: 3 mm das bordas e da linha de corte central. A pasta `molduras-teste` tem um PNG de exemplo para cada formato.

## Atalhos de hardware

As teclas de volume e controles Bluetooth de selfie disparam a câmera.
