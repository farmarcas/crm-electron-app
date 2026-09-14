# Manual de Integração — CRM Radar

Guia para integrar um sistema de PDV / Orçamento Balcão ao CRM Radar.

Este documento é autocontido: seguindo o que está aqui, a integração é concluída
sem depender de suporte da Farmarcas.

---

## 1. Visão geral

O CRM Radar é um aplicativo instalado no computador do caixa que exibe, num
painel lateral, o perfil e o histórico de compras do cliente em atendimento.

Ele expõe um serviço HTTP **local**, acessível apenas pela própria máquina. O
PDV faz duas chamadas:

| Chamada | Quando | Efeito |
|---|---|---|
| **Identificação** | Ao capturar o CPF do cliente | Abre o atendimento e o painel carrega sozinho |
| **Itens da cesta** | A cada item inserido na venda | Registra a cesta em andamento |

Não há software adicional para instalar, nem credencial, nem cadastro, nem
biblioteca para incluir no projeto. Basta uma requisição HTTP.

### O que a integração resolve

Sem ela, o operador digita o CPF no PDV e precisa digitar de novo no painel do
CRM Radar. Com ela, o painel carrega sozinho — sem tirar o foco do teclado e sem
interromper o que o operador está fazendo.

---

## 2. Endereço

```
http://127.0.0.1:50505
```

| Chamada | Método | Caminho |
|---|---|---|
| Identificação | `POST` | `/identification` |
| Itens da cesta | `POST` | `/basket` |

**Use `127.0.0.1`, não `localhost`.** O serviço aceita apenas conexões IPv4; um
cliente que resolva `localhost` para `::1` não conecta.

O serviço escuta somente na própria máquina. Não é alcançável pela rede da
farmácia, nem de outro computador.

### Cabeçalhos

| Cabeçalho | Valor |
|---|---|
| `Content-Type` | `application/json` — parâmetros como `; charset=utf-8` são aceitos |

Não há autenticação. O serviço é protegido por só aceitar conexões locais.

---

## 3. Regras de integração

Estas regras não são recomendações — a integração depende delas para funcionar
bem no balcão.

**Chame quando o dado estiver completo, nunca a cada tecla digitada.** A
identificação é uma chamada por atendimento, disparada quando o CPF termina de
ser capturado.

**Nunca bloqueie a venda esperando a resposta.** Dispare a chamada de forma
assíncrona e siga o fluxo. O operador não pode ficar parado por causa disso.

**Trate o aplicativo ausente como cenário normal e silencioso.** Se o CRM Radar
não estiver rodando, a conexão é recusada. Isso é esperado — registre no seu log
se quiser, mas **não exiba alerta, aviso ou erro ao operador**.

**Não repita chamadas recusadas por validação.** Um retorno 4xx significa que o
dado enviado está incorreto; repetir vai falhar de novo. Corrija o envio.

**Chame a partir do processo nativo do PDV, nunca de página em navegador.** A
integração foi desenhada para o software instalado no caixa. Uma página web
hospedada em outro endereço não consegue chamar o serviço — o próprio navegador
bloqueia a chamada.

**Serialize as chamadas de cesta.** Cada chamada substitui a anterior. Se duas
saírem em paralelo por conexões diferentes, a mais lenta pode chegar por último
e reverter a cesta para um estado anterior. Reutilize uma única conexão ou
aguarde a resposta antes de enviar a próxima.

---

## 4. Chamada 1 — Identificação

Enviada uma vez por atendimento, quando o CPF do cliente é capturado.

```
POST /identification
Content-Type: application/json
```

```json
{
  "store":    { "cnpj": "12345678000190" },
  "customer": { "cpf": "12345678901" },
  "seller":   { "id": 42, "name": "Ana Souza" }
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `store.cnpj` | String | Sim | CNPJ da loja — 14 dígitos |
| `customer.cpf` | String | Sim | CPF do cliente — 11 dígitos |
| `seller.id` | Integer ou String | Não | Identificador do vendedor |
| `seller.name` | String | Não | Nome do vendedor, até 120 caracteres |

**CPF e CNPJ podem ser enviados com ou sem pontuação.** `12.345.678/0001-90` e
`12345678000190` são equivalentes. A validação é de quantidade de dígitos: 14
para o CNPJ, 11 para o CPF. O dígito verificador não é conferido.

**O vendedor é opcional.** A chamada funciona normalmente sem ele. Quando
enviado, é registrado junto ao atendimento. Se algum campo do vendedor vier com
tipo inválido, ele é descartado e a identificação segue normalmente — o vendedor
nunca derruba um atendimento.

**Uma nova identificação substitui a anterior**, e a cesta registrada até então é
descartada.

### Respostas

| Status | Corpo | Significado |
|---|---|---|
| 200 | `{"ok":true}` | Atendimento aberto |
| 422 | `{"error":"invalid_payload"}` | CNPJ ou CPF ausente ou com quantidade de dígitos incorreta |

A resposta chega em menos de 100 ms e nunca contém dado do cliente.

---

## 5. Chamada 2 — Itens da cesta

Enviada **a cada item inserido** na venda, sempre com a cesta inteira naquele
momento — não apenas o item novo.

```
POST /basket
Content-Type: application/json
```

```json
{
  "sales_items": [
    { "id": 8801, "name": "Dipirona 500mg 20cp",
      "quantity": 1, "stock": 34, "price": 12.90,
      "ean": "7891234567890", "sku": "DIP500" },
    { "id": 4417, "name": "Água Micelar 200ml",
      "quantity": 2, "stock": 8, "price": 34.50,
      "ean": "7899876543210", "sku": "AGU200" }
  ]
}
```

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `sales_items` | Array | Sim | A cesta inteira. Máximo 500 itens |
| `sales_items[].id` | Integer | Sim | Identificador do produto |
| `sales_items[].name` | String | Sim | 1 a 200 caracteres |
| `sales_items[].quantity` | Integer | Sim | Zero ou positivo |
| `sales_items[].stock` | Integer | Sim | Pode ser negativo |
| `sales_items[].price` | Número | Sim | Zero ou positivo. Aceita decimal |
| `sales_items[].ean` | String | Sim | 1 a 20 caracteres |
| `sales_items[].sku` | String | Sim | 1 a 64 caracteres |

### Comportamento

**Cada chamada substitui a cesta anterior.** Os itens não são acumulados. Se a
primeira chamada envia 1 item e a segunda envia 2, o resultado é 2 itens — nunca 3.

**`sales_items` vazio é válido** e significa que o operador esvaziou o carrinho.

**Campos desconhecidos são ignorados**, não causam erro. Isso permite que o
payload evolua sem quebrar a integração.

**Se não houver atendimento aberto, a chamada é aceita e ignorada em silêncio.**
Acontece quando a cesta chega antes da identificação. A resposta é `200
{"ok":true}`, exatamente como no caso normal. Não é erro e **não deve ser
repetida**.

**O limite prático é de tamanho, não de quantidade.** O corpo da requisição não
pode passar de 64 KiB (65536 bytes); dependendo do tamanho dos nomes dos
produtos, esse limite é atingido bem antes dos 500 itens.

### Respostas

| Status | Corpo | Significado |
|---|---|---|
| 200 | `{"ok":true}` | Aceita — registrada, ou ignorada por não haver atendimento aberto |
| 422 | `{"error":"invalid_payload","details":[...]}` | Payload inválido — ver seção 6 |

A resposta nunca contém dado do cliente e nunca contém sugestão de produto.

---

## 6. Respostas e códigos de erro

### Tabela completa

| Status | Corpo | Quando acontece |
|---|---|---|
| **200** | `{"ok":true}` | Sucesso, nas duas chamadas |
| **400** | `{"error":"invalid_json"}` | O corpo não é JSON válido |
| **403** | *(vazio)* | Cabeçalho `Host` diferente de `127.0.0.1:50505` / `localhost:50505` |
| **404** | *(vazio)* | Caminho inexistente |
| **405** | *(vazio)* | Método diferente de `POST` |
| **413** | *(vazio)* | Corpo acima de 64 KiB |
| **415** | *(vazio)* | `Content-Type` ausente ou diferente de `application/json` |
| **422** | `{"error":"invalid_payload"}` | Payload inválido |
| **500** | *(vazio)* | Falha interna |

> **Respostas 403, 404, 405, 413, 415 e 500 não têm corpo nem cabeçalho
> `Content-Type`.** Não tente interpretá-las como JSON — verifique o código de
> status antes de ler o corpo. Esta é a causa mais comum de exceção no cliente.

### Detalhamento do 422

A chamada de identificação retorna apenas `{"error":"invalid_payload"}`.

A chamada de cesta acrescenta um array `details` indicando quais campos estão
incorretos:

```json
{
  "error": "invalid_payload",
  "details": [
    { "path": "sales_items[0].price", "code": "invalid_type", "expected": "number" },
    { "path": "sales_items[1].sku",   "code": "required" }
  ]
}
```

| Código | Significado |
|---|---|
| `required` | Campo obrigatório ausente ou nulo |
| `invalid_type` | Tipo diferente do esperado |
| `not_an_integer` | Número recebido, mas com casas decimais onde se espera inteiro |
| `too_short` | Texto menor que o mínimo |
| `too_long` | Texto maior que o máximo |
| `out_of_range` | Número fora da faixa permitida |
| `too_many_items` | Mais de 500 itens |
| `not_an_object` | Item da lista não é um objeto |

O campo `expected` descreve o que era esperado. **Os detalhes nunca repetem o
valor recebido** — apenas o caminho do campo e o que se esperava dele.

### Erros de tipo mais comuns

| Envio incorreto | Correto |
|---|---|
| `"id": "8801"` | `"id": 8801` — inteiro, não texto |
| `"quantity": 1.5` | `"quantity": 1` — inteiro |
| `"price": "12,90"` | `"price": 12.90` — número, ponto decimal |

---

## 7. Exemplos

### Documentação interativa

Com o CRM Radar em execução, a documentação interativa fica em:

```
http://127.0.0.1:50505/docs
```

Nela, as duas chamadas podem ser enviadas direto pelo botão **Try it out**. As
chamadas são reais: uma identificação enviada pela página abre o atendimento no
painel.

A mesma especificação, no arquivo `openapi.yaml` disponibilizado junto com este
manual, pode ser importada no Postman (**Import → File**) — cada chamada vira uma
requisição pronta para enviar.

### Pela linha de comando

Os exemplos usam `curl.exe` e funcionam no **Prompt de Comando** e no
**PowerShell** do Windows.

> No PowerShell, use `curl.exe` e não `curl` — `curl` é apelido de outro comando
> e a sintaxe não é compatível.

### Abrir o atendimento

```bash
curl.exe -i -X POST http://127.0.0.1:50505/identification -H "Content-Type: application/json" -d "{\"store\":{\"cnpj\":\"12345678000190\"},\"customer\":{\"cpf\":\"12345678901\"}}"
```

Resposta esperada:

```
HTTP/1.1 200 OK
Content-Type: application/json

{"ok":true}
```

### Abrir o atendimento com vendedor e pontuação

```bash
curl.exe -i -X POST http://127.0.0.1:50505/identification -H "Content-Type: application/json" -d "{\"store\":{\"cnpj\":\"12.345.678/0001-90\"},\"customer\":{\"cpf\":\"123.456.789-01\"},\"seller\":{\"id\":42,\"name\":\"Ana Souza\"}}"
```

### Enviar a cesta com um item

```bash
curl.exe -i -X POST http://127.0.0.1:50505/basket -H "Content-Type: application/json" -d "{\"sales_items\":[{\"id\":8801,\"name\":\"Dipirona 500mg 20cp\",\"quantity\":1,\"stock\":34,\"price\":12.90,\"ean\":\"7891234567890\",\"sku\":\"DIP500\"}]}"
```

### Enviar a cesta atualizada com dois itens

```bash
curl.exe -i -X POST http://127.0.0.1:50505/basket -H "Content-Type: application/json" -d "{\"sales_items\":[{\"id\":8801,\"name\":\"Dipirona 500mg 20cp\",\"quantity\":1,\"stock\":34,\"price\":12.90,\"ean\":\"7891234567890\",\"sku\":\"DIP500\"},{\"id\":4417,\"name\":\"Agua Micelar 200ml\",\"quantity\":2,\"stock\":8,\"price\":34.50,\"ean\":\"7899876543210\",\"sku\":\"AGU200\"}]}"
```

O estado final é de dois itens — a cesta anterior foi substituída, não somada.

### Esvaziar a cesta

```bash
curl.exe -i -X POST http://127.0.0.1:50505/basket -H "Content-Type: application/json" -d "{\"sales_items\":[]}"
```

### Ver uma recusa por validação

```bash
curl.exe -i -X POST http://127.0.0.1:50505/basket -H "Content-Type: application/json" -d "{\"sales_items\":[{\"id\":\"8801\",\"name\":\"Dipirona\",\"quantity\":1,\"stock\":34,\"price\":12.90,\"ean\":\"789\",\"sku\":\"DIP\"}]}"
```

Resposta esperada:

```
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{"error":"invalid_payload","details":[{"path":"sales_items[0].id","code":"invalid_type","expected":"integer"}]}
```

> Em sistemas Linux ou macOS, use `curl` no lugar de `curl.exe`. As aspas
> escapadas funcionam do mesmo jeito.

---

## 8. Diagnóstico

### Não existe endpoint de verificação de saúde

Não consulte nenhum endereço para "testar se está no ar" antes de chamar — nem a
página de documentação. Chame o endereço que você precisa e trate o retorno.

### Conexão recusada significa aplicativo fora do ar

Se o CRM Radar não estiver em execução, a tentativa de conexão é recusada
imediatamente. **Este é o sinal de indisponibilidade** — e é um cenário normal,
que deve ser tratado em silêncio, sem alertar o operador.

### Guia rápido

| Sintoma | Causa provável |
|---|---|
| Conexão recusada | Aplicativo fora do ar. Cenário normal, siga a venda |
| 403 | Cabeçalho `Host` alterado por proxy ou pela configuração do cliente HTTP |
| 404 | Caminho incorreto. Confira `/identification` e `/basket` |
| 405 | Método diferente de `POST` |
| 413 | Cesta grande demais. Corpo limitado a 64 KiB |
| 415 | `Content-Type` ausente ou diferente de `application/json` |
| 422 na identificação | CNPJ sem 14 dígitos ou CPF sem 11 dígitos |
| 422 na cesta | Ver `details` na resposta |
| Nada aparece no painel | Confirme que a identificação retornou 200 antes de enviar a cesta |

---

## 9. O que a API não faz

**Não devolve dado de cliente.** Nenhuma resposta contém nome, CPF, histórico ou
qualquer informação do cliente. O PDV envia; não recebe de volta.

**Não devolve sugestões.** Quando a recomendação a partir da cesta existir, ela
será exibida **apenas no painel do CRM Radar**, na tela do operador. Ela nunca é
retornada ao PDV para exibição.

**Não confirma que o painel foi atualizado.** A resposta 200 confirma que a
chamada foi recebida — nada além disso. O PDV não deve aguardar nem depender do
que acontece na tela.

**Nesta entrega, a cesta é apenas registrada.** Nenhuma recomendação é gerada a
partir dela e nada muda na tela do operador quando ela chega. O canal é
construído agora para que, quando o cruzamento com o histórico existir, o dado já
esteja chegando — sem exigir uma segunda rodada de integração.

---

## 10. Resumo da integração

1. Ao capturar o CPF: `POST /identification` com CNPJ da loja e CPF do cliente.
2. A cada item inserido: `POST /basket` com a cesta inteira.
3. Nunca bloquear a venda esperando resposta.
4. Conexão recusada e respostas de erro: registrar no log, seguir em silêncio.
5. Serializar as chamadas de cesta.
