# Arena Reversa — Showdown local

Um jogo independente de sobrevivência top-down, feito para navegador e sem servidor. O jogador escolhe um de três lutadores originais, enfrenta bots rivais, abre caixas de suprimento, coleta cubos de poder e tenta continuar dentro da zona segura.

## Executar

O projeto não precisa de banco de dados, login, dependências externas ou serviço multiplayer.

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080` no computador ou no celular conectado à mesma rede. O jogo também pode ser servido por qualquer hospedagem estática.

## Controles

- **Computador:** WASD ou setas para mover; mouse para mirar e segurar o botão esquerdo para disparar; espaço para usar o especial; Esc para pausar.
- **Celular:** joystick esquerdo para mover; joystick direito para mirar e disparar; botão Super para a habilidade especial. A interface respeita as áreas seguras da tela.

## Partida

- **Showdown Solo:** oito adversários no modo Normal, caixas destrutíveis, cubos de poder derrubados por caixas e lutadores eliminados e zona de tempestade que fecha durante a partida.
- **Treino:** quatro adversários, para praticar combate sem tempestade.
- **Dificuldade:** Leve, Normal ou Intensa altera quantidade, vida, velocidade, recarga e precisão dos bots.
- Os bots procuram caixas, disputam cubos, atacam qualquer rival, desviam de projéteis, usam o cenário e podem ativar suas habilidades.
- Mira, Brasa e Volta têm padrões de tiro, atributos e especiais próprios.
- Vitória, derrota, pausa, reinício, indicadores de vida, recarga, cubos, tempo e eliminações estão incluídos.
- Estatísticas de partidas ficam somente no `localStorage` do navegador.

## Arquivos

- `index.html` — menu, seleção e HUD da partida.
- `css/style.css` — identidade visual e adaptação desktop/mobile.
- `js/engine.js` — movimento, colisão, combate, IA, caixas, cubos e tempestade.
- `js/game.js` — controles, interface e desenho da arena.
- `assets/characters.svg` — três sprites vetoriais originais.
- `tests/engine.test.cjs` — testes do motor usando `node:test`.

Todos os personagens, nomes, ilustrações e interface deste protótipo são originais. A inspiração é o gênero de arena de sobrevivência; não há arquivos de arte ou áudio extraídos de outro jogo.

## Verificação local

```bash
node --check js/engine.js
node --check js/game.js
node --test tests/*.test.cjs
```

## Limites desta versão

Esta é uma partida offline contra bots, não há multiplayer, contas nem persistência em nuvem. Os controles são desenhados na tela para toque e ponteiro; a validação precisa ser feita no dispositivo final antes de tratar a experiência como lançamento em produção.
