from google import genai
from app.core.config import settings


class AIService:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @staticmethod
    def ask_banking_assistant(user, account, transactions, query):
        prompt = f"""
You are a banking assistant.

User Email: {user.email}
Account Balance: ₹{account.balance}
Currency: {account.currency}
Transactions: {transactions}

User Question: {query}

Rules:
- Give short, clear, banking-style answers.
- If the user asks for balance, mention only the balance.
- If the user asks for recent transactions, format them clearly.
- If the user asks for last transfer/deposit/withdrawal, return only that item.
"""

        try:
            response = AIService.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt
            )
            return response.text

        except Exception as e:
            print("AI ERROR:", str(e)) 
            q = query.lower()

        if "hi" in q or "hello" in q:
            return "Hello! How can I help you today?"

        if "balance" in q:
            return f"Your current balance is ₹{account.balance:.2f}"

        if "transaction" in q:
            if not transactions:
                return "No recent transactions found."

        formatted = "Here are your recent transactions:\n\n"
        for txn in transactions[:5]:
            formatted += (
                f"* {txn.transaction_type} | amount={float(txn.amount):.2f} | "
                f"ref={txn.reference} | status={txn.status}\n"
            )
        return formatted.strip()

        if "transfer" in q:
            return "Your recent transfer details are shown above."

        if "deposit" in q:
            return "Your recent deposit details are shown above."

        if "withdraw" in q:
            return "Your recent withdrawal details are shown above."

        return "I can help you with balance, transactions, or transfers."
            

        query_lower = query.lower()

        if "balance" in query_lower:
            return f"Your current account balance is ₹{account.balance:.2f}"

        if "transaction" in query_lower:
            if not transactions:
                return "No recent transactions found."

                formatted = "Here are your recent transactions:\n\n"

                latest_five = transactions[:5]

                for txn in latest_five:
                    formatted += (
                        f"* {txn.transaction_type} | amount={float(txn.amount):.2f} | "
                        f"ref={txn.reference} | status={txn.status}\n"
                    )

                return formatted.strip()

            # Last transfer fallback
            if "transfer" in query_lower:
                transfer_txn = None

                for txn in transactions:
                    if txn.transaction_type.lower() == "transfer":
                        transfer_txn = txn
                        break

                if not transfer_txn:
                    return "No transfer transactions found."

                return (
                    f"Here is your last transfer:\n\n"
                    f"* transfer | amount={float(transfer_txn.amount):.2f} | "
                    f"ref={transfer_txn.reference} | status={transfer_txn.status}"
                )

            # Last deposit fallback
            if "deposit" in query_lower:
                deposit_txn = None

                for txn in transactions:
                    if txn.transaction_type.lower() == "deposit":
                        deposit_txn = txn
                        break

                if not deposit_txn:
                    return "No deposit transactions found."

                return (
                    f"Here is your last deposit:\n\n"
                    f"* deposit | amount={float(deposit_txn.amount):.2f} | "
                    f"ref={deposit_txn.reference} | status={deposit_txn.status}"
                )

            # Last withdrawal fallback
            if "withdraw" in query_lower or "withdrawal" in query_lower:
                withdraw_txn = None

                for txn in transactions:
                    if txn.transaction_type.lower() == "withdraw":
                        withdraw_txn = txn
                        break

                if not withdraw_txn:
                    return "No withdrawal transactions found."

                return (
                    f"Here is your last withdrawal:\n\n"
                    f"* withdraw | amount={float(withdraw_txn.amount):.2f} | "
                    f"ref={withdraw_txn.reference} | status={withdraw_txn.status}"
                )

            return "AI service is busy right now. Please try again in a moment."