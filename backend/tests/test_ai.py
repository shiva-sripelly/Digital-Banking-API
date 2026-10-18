def ask(client, query):
    resp = client.post("/ai/query", json={"query": query})
    assert resp.status_code == 200
    return resp.json()["answer"]


def test_fallback_answers_use_real_account_data(funded_user):
    c, _ = funded_user(250)

    assert ask(c, "What is my balance?") == "Your current balance is ₹250.00"
    assert ask(c, "Show my recent transactions").startswith("Here are your recent transactions:")
    assert ask(c, "my last transfer") == "No transfer transactions found."


def test_greeting_detection_uses_whole_words(make_user):
    c, _ = make_user()
    assert ask(c, "hello") == "Hello! How can I help you today?"
    assert "Hello" not in ask(c, "this is something else")


def test_query_length_is_bounded(make_user):
    c, _ = make_user()
    assert c.post("/ai/query", json={"query": "x" * 501}).status_code == 422
