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


## Atualização — data de nascimento
- O cadastro/ficha do aluno agora possui o campo **Data de nascimento** e salva o valor em `siap/alunos/{id}/dataNascimento`.
- A data aparece na listagem de matrículas e no comprovante impresso; a exportação CSV também inclui a coluna.
- Para bancos de demonstração, `migrar-nascimentos-demo.html` permite preencher datas aleatórias apenas nos registros sem data. Abra a página autenticado como Secretaria, Gestor ou Coordenação, confira a quantidade e confirme a operação.
- **Importante:** datas aleatórias são fictícias e não devem ser gravadas em cadastros reais ou documentos escolares oficiais. Para alunos reais, preencha a data confirmada nos documentos.
- Não foi possível gravar diretamente no Firebase a partir deste ambiente, pois a conexão externa com o banco não estava disponível. O utilitário incluído executa a migração quando o sistema estiver hospedado e conectado.
