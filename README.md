# FoodCritic Fácil (Lite)

App de delivery web para pedir comida em restaurantes parceiros.  
Feito como trabalho escolar, com interface simples e fluxo completo de pedido.

**Demo online:** [https://ronaldokaras.github.io/FoodCritic-Lite/](https://ronaldokaras.github.io/FoodCritic-Lite/)

---

## O que faz

- Login e cadastro de usuário (Supabase Auth)
- Lista de restaurantes e cardápio por categoria
- Busca por restaurante ou prato
- Carrinho (um restaurante por vez)
- Endereço de entrega + telefone com DDI
- Pagamento simulado (dinheiro, Pix ou cartão na entrega)
- Acompanhamento do pedido em etapas
- Fotos reais do bucket de imagens do projeto

---

## Como abrir

### Online
Acesse: [https://ronaldokaras.github.io/FoodCritic-Lite/](https://ronaldokaras.github.io/FoodCritic-Lite/)

### No computador
1. Baixe ou clone este repositório
2. Abra a pasta no VS Code (ou similar)
3. Use o Live Server (ou outro servidor local) na pasta do projeto
4. Abra `index.html` — se não estiver logado, o app manda para `login.html`

> Precisa de internet: o app usa Supabase e as imagens ficam no storage.

---

## Estrutura

```
FoodCritic-Lite/
├── index.html          # App principal
├── login.html          # Entrar
├── register.html       # Criar conta
├── css/
│   ├── style.css       # Design base (cores, tipografia, layout)
│   ├── lite.css        # Ajustes finos
│   └── flow.css        # Navegação, animações, mobile
├── js/
│   ├── config.js       # Supabase + utilitários (toast, dinheiro, etc.)
│   ├── auth.js         # Login, cadastro e logout
│   └── app.js          # Telas, carrinho, pedido, mapa
└── README.md
```

---

## Tecnologias

| Parte        | Tecnologia                          |
|--------------|-------------------------------------|
| Front        | HTML, CSS, JavaScript (vanilla)     |
| Auth / dados | Supabase (Auth, Postgres, Storage)  |
| Mapa         | Leaflet (cadastro de loja, se ativo)|
| Fontes       | Fraunces + Nunito Sans              |
| Ícones      | Font Awesome 6                      |

---

## Fluxo do pedido

1. Entrar na conta  
2. Escolher restaurante e adicionar pratos  
3. Revisar o carrinho  
4. Informar nome, telefone e endereço  
5. Escolher forma de pagamento  
6. Acompanhar o status do pedido  

O pedido fica salvo neste aparelho (`localStorage`). O logout limpa carrinho, endereço e pedido locais.

---

## Conta de teste

Use um e-mail e senha criados em **Criar conta**, ou as credenciais que o professor passar para a turma.

---

## Observações

- O botão de **Nova loja** está oculto na versão pública (apresentação).
- As imagens vêm do bucket público `img_comidas` no Supabase.
- Funciona melhor em Chrome, Edge ou Firefox atualizados.

---

## Links

- **Site:** https://ronaldokaras.github.io/FoodCritic-Lite/
- **Repositório:** https://github.com/ronaldokaras/FoodCritic-Lite
