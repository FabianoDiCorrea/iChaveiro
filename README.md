# iChaveiro

Sistema de gestão para chaveiro e cutelaria.

## Funcionalidades
- **2 Perfis em 1**: Separação de faturamento entre "Chaveiro" (Sogro) e "Fabiano" (Cutelaria/Pós 17h).
- **Caixa/PDV Rápido**: Seleção de serviços (Chaves, Alicates, Tesouras, Facas, Outros) e cálculo automático.
- **Formas de Pagamento**: Dinheiro, Débito, Crédito, PIX.
- **Devoluções**: Registro de devoluções de dinheiro com controle de método de pagamento.
- **Clientes**: Cadastro de clientes com código de pacote para organização de serviços.
- **Relatórios**: Geração de PDF de faturamento diário, mensal, anual ou personalizado.
- **Banco de Dados Local**: Utiliza IndexedDB (Dexie) para garantir que os dados fiquem salvos no notebook mesmo sem internet.

## Como rodar o projeto

1. Instale as dependências:
```bash
npm install
```

2. Rode o servidor de desenvolvimento:
```bash
npm run dev
```

3. Para gerar a versão final de produção:
```bash
npm run build
```

## Sincronização com Nuvem (Git)
Como você mencionou que usa Git para salvar na nuvem:
1. `git init` (se ainda não fez)
2. `git add .`
3. `git commit -m "Inicializando iChaveiro"`
4. `git push origin main`

O banco de dados do sistema fica salvo no navegador (IndexedDB) e não é enviado para o Git. Para fazer backup dos dados no futuro, podemos adicionar uma função de exportar/importar o banco de dados em formato JSON.
