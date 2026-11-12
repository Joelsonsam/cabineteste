# Cabine Mude!

App de cabine fotográfica offline da Mude! Agência de Live Marketing. Operado pela equipe em um celular Android por evento.

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
