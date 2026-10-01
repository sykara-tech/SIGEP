# SIGEP — Sistema de Gerenciamento Pedagógico

**Versão:** 16.0-final · Ano letivo 2026  
**Unidade:** Colégio Estadual · Código 520 · CRE Águas Lindas de Goiás

## O que é
Sistema web de gestão escolar (cadastros, diário do professor, prova de bloco, frequência, boletins, documentos e painel gerencial), integrado ao Firebase Realtime Database.

## Como usar
1. Hospede todos os arquivos em um servidor web (ou abra `index.html` / `login.html` via servidor local).
2. Acesse `login.html` e entre com um dos usuários de demonstração:
   - **secretaria** / 123456
   - **coordenacao** / 123456
   - **gestor** / 123456
   - **professor** / 123456
3. O captcha de segurança é gerado na tela de login.

## Melhorias desta versão (v16)
- Nome oficial: **SIGEP — Sistema de Gerenciamento Pedagógico**
- Animações suaves de página, cards, tabelas e overlay de carregamento
- **Sistema antitravamento**: watchdog de 25s no overlay, liberação automática se o main thread travar, tecla Escape fecha o carregamento
- Transições entre módulos (ex.: Diário → Notas / Frequência / Bloco)
- Acessibilidade: skip link, `aria-live`, foco visível, `prefers-reduced-motion`, labels em formulários
- Interface mais profissional e responsiva

## Estrutura principal
- `app.js` — núcleo (auth, Firebase, cache offline, impressão, menus)
- `style.css` — identidade visual e animações
- `diario.js` / `diario.html` — diário do professor
- `sec-*.html` — módulos da secretaria
- `menu.html` — menu por perfil

## Observações
- Caminhos de dados no Firebase permanecem sob o prefixo `siap/` para compatibilidade.
- Cache local (`localStorage`) permite uso offline parcial.
