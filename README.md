# Reinos da Arena — projeto escolar

**Versão 2.0 · jogo local inspirado em batalhas de cartas e torres**

Este repositório substitui o protótipo inicial por uma experiência local com navegação entre telas, coleção de cartas, deck editável, loja simulada, passe de recompensas, emotes, estatísticas locais e batalhas contra bots.

> Projeto educacional independente. Usa nomes genéricos/algumas referências de cartas para demonstrar mecânicas, mas não inclui código, imagens, áudio ou outros arquivos extraídos de Clash Royale. Não é um produto oficial da Supercell.

## Como executar

1. Baixe o ZIP pelo botão **Code → Download ZIP** ou clone o repositório.
2. Extraia a pasta.
3. Abra a pasta no VS Code.
4. Instale/ative a extensão **Live Server**, se ainda não tiver.
5. Clique com o botão direito em `index.html` e escolha **Open with Live Server**.

Também é possível abrir `index.html` diretamente em navegadores modernos, mas o Live Server costuma ser mais confiável.

## O que está incluído

- Tela principal com atalhos para batalha, cartas, loja, passe, emotes e perfil.
- Arena 2D com torres, rio, pontes, tropas, projéteis, vida e elixir.
- Batalhas contra bot que posiciona tropas automaticamente.
- Três opções de partida: clássica, morte súbita e treinamento.
- Deck de oito cartas editável; custo de elixir e nível 11 exibidos na coleção.
- Coleção ampla de cartas de demonstração com filtro por nome e raridade.
- Loja fictícia, recompensas simuladas e deck de até oito emotes.
- Troféus, vitórias, derrotas e progresso salvos no navegador por `localStorage`.
- Recursos de demonstração: 999.999 de ouro e 999.999 gemas exibidos na interface.
- Layout adaptável a computador e celular; mouse/toque para posicionar cartas, teclas 1–4 para selecionar a mão.

## Controles da batalha

- Clique/toque numa carta na mão para selecioná-la.
- Clique/toque na metade inferior da arena para posicionar a tropa.
- Use as teclas **1**, **2**, **3** e **4** para selecionar as cartas da mão.
- O elixir regenera com o tempo; tropas e feitiços custam elixir.

## Limitações conhecidas

Esta é uma implementação independente em evolução, não uma reprodução oficial nem um clone exato. A coleção é uma seleção ampla de cartas de demonstração, não uma garantia de conter absolutamente todas as cartas e variantes da versão comercial atual. A loja, o passe e as recompensas são locais e fictícios. Os bots usam regras simples de posicionamento e combate, não a IA proprietária do jogo original. Ainda é necessário testar em diferentes navegadores e tamanhos de tela.

## Arquivos principais

- `index.html` — estrutura das telas.
- `css/style.css` — interface responsiva.
- `js/game.js` — cartas, navegação, batalha, bot, progressão e salvamento.

## Projeto escolar

Objetivo: estudar interface, estado do jogo, ciclos de atualização, colisões simples, inteligência artificial baseada em regras e salvamento local sem backend ou banco de dados.
