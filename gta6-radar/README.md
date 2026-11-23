# LEONIDA — GTA VI RADAR

Dashboard de notícias sobre Grand Theft Auto VI, em português, com coleta agendada de manchetes, links da Rockstar e atualizações de repositórios de recompilação.

## Funcionalidades

- Notícias de **GTA VI**, **PC/port**, **vazamentos reportados**, **recompilação** e **anúncios oficiais**.
- Coleta automática (GitHub Actions a cada ~30 minutos, sujeito a atrasos do GitHub).
- Atualização do navegador a cada 2 minutos, sem precisar recarregar a aba.
- Busca, ordenação, filtros e favoritos mantidos neste navegador.
- Monitoramento de **ItsNotRexed/Leonida** e **R0Y00/Xbox2Windows** via API do GitHub: estrelas, forks, issues, commits recentes.
- Alertas opcionais enquanto a aba está aberta e o navegador permite notificações.
- Visual responsivo para desktop e celular.
- Sem chaves de API, conta externa paga ou bibliotecas Python adicionais.

## PUBLICAR GRÁTIS NO GITHUB PAGES — PASSO A PASSO

1. Entre em https://github.com/new e crie um repositório **público**, por exemplo `gta6-radar`. Se você quiser que apenas você gerencie o projeto, mantenha a edição do repositório restrita; o site público terá acesso apenas a notícias públicas.
2. Descompacte este ZIP e **envie o conteúdo da pasta `gta6-radar` para a raiz do repositório**, incluindo a pasta `.github/workflows`. No Windows, lembre de habilitar a exibição de itens ocultos para não perder `.github`.
3. Confirme que a branch principal se chama **main**.
4. Abra **Settings → Actions → General → Workflow permissions** e habilite **Read and write permissions** para que o agendamento possa atualizar `site/data/feed.json` (se a organização ou conta permitir). Salve.
5. Abra **Settings → Pages** e, em **Build and deployment / Source**, selecione **GitHub Actions**.
6. Vá em **Actions → Atualizar o GTA VI Radar → Run workflow** para iniciar a primeira coleta e publicação. Se necessário, aceite o uso de workflows no repositório.
7. Quando o workflow concluir, seu site será `https://SEU_USUARIO.github.io/gta6-radar/` (o nome depende do repositório). O link final também aparece em **Settings → Pages**.

Depois da primeira execução, o GitHub agenda novas coletas automaticamente de 30 em 30 minutos, podendo atrasar e ocasionalmente pular execuções por restrições da plataforma. Você também pode executar manualmente o workflow.

> **Importante:** GitHub Pages não roda programas Python continuamente. A ação agendada executa o Python, atualiza o JSON e publica uma versão estática. A página aberta confere esse JSON a cada 2 minutos. Não significa coleta instantânea a cada notícia.

## TESTAR LOCALMENTE

O `site/index.html` tem um conjunto inicial de notícias verificadas como fallback. Para testar o carregamento do JSON, dentro de `site/` execute:

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. Para executar o coletor antes de publicar, rode na pasta raiz:

```bash
python scripts/update.py
```

O coletor precisa de acesso à internet. Ele usa apenas a biblioteca padrão do Python e pode ser executado gratuitamente no GitHub Actions.

## Fontes e confiabilidade

- Rockstar Newswire (links diretos, quando o layout permite a leitura).
- Google Notícias RSS: consultas independentes sobre GTA VI, PC, vazamentos e recompilação; as reportagens são atribuídas ao veículo indicado no RSS e acessadas pelo link do Google Notícias.
- API pública do GitHub: metadados e commits dos projetos monitorados.
- Reportagens envolvendo vazamentos são classificadas como **não verificadas** quando usam palavras como “leak/vazamento”.

**Classificação automática tem limitações.** Manchetes podem errar, e os algoritmos não fazem verificação editorial. O selo “Oficial” fica reservado a links diretos do domínio Rockstar. Novos commits não comprovam GTA VI funcionando no Windows.

O projeto **não armazena nem distribui** builds, torrents, credenciais, DRM, executáveis vazados, assets do jogo ou links diretos de pirataria. Não é afiliado à Rockstar Games nem à Take-Two Interactive.

## Estrutura

```text
site/
  index.html       # visual e conteúdo do dashboard
  styles.css       # tema e responsividade
  app.js           # filtros, favoritos, busca e atualização da tela
  fallback.js      # notícias iniciais para a prévia offline
  data/feed.json   # notícias e repositórios atualizados pelo coletor
scripts/update.py  # coletor RSS / Rockstar / API GitHub
.github/workflows/update.yml  # agendamento e publicação no GitHub Pages
```

## Personalização

- Mude as fontes de notícia em `FEEDS`, dentro de `scripts/update.py`.
- Mude ou acrescente repositórios em `REPO_NAMES` e `GITHUB_INFO` no mesmo arquivo.
- Ajuste cores e fontes em `site/styles.css`.
- Ajuste a frequência de checagem da página com `REFRESH_MS` em `site/app.js`.
- Altere o agendamento no cron de `.github/workflows/update.yml`.

## Sobre os alertas

O botão de notificações **não** cria um serviço de envio em segundo plano. Ele pede permissão do navegador e mostra alertas apenas se a página estiver aberta, houver uma notícia recém-detectada no feed e a aba puder mostrar a notificação. Alertas com a página fechada exigiriam um backend de push separado.
