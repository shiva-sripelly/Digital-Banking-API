import logging
import re

from google import genai
from app.core.config import settings

logger = logging.getLogger("app.ai")


def format_transaction(txn) -> str:
    return (
        f"* {txn.transaction_type} | amount={float(txn.amount):.2f} | "
        f"ref={txn.reference} | status={txn.status}"
    )


class AIService:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    @staticmethod
    def ask_banking_assistant(user, account, transactions, query):
        if account is None:
            return "I couldn't find a bank account linked to your profile."

        recent = "\n".join(format_transaction(txn) for txn in transactions[:20]) or "None"

        prompt = f"""
You are a banking assistant.

User Email: {user.email}
Account Balance: ₹{account.balance}
Currency: {account.currency}
Transactions (newest first):
{recent}

User Question: {query}

Rules:
- Give short, clear, banking-style answers.
- If the user asks for balance, reply exactly in the form "Your current balance is ₹<amount>".
- If the user asks for recent transactions, start with "Here are your recent transactions:" and list them in the same "* type | amount=... | ref=... | status=..." format.
- If the user asks for last transfer/deposit/withdrawal, start with "Here is your last <type>:" and return only that item in the same format.
"""

        try:
            response = AIService.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt
            )
            if response.text:
                return response.text
        except Exception as e:
            logger.warning("Gemini request failed (%s); using rule-based fallback", type(e).__name__)

        return AIService.fallback_answer(account, transactions, query)

    @staticmethod
    def fallback_answer(account, transactions, query):
        """Rule-based answers used when Gemini is unavailable."""
        q = query.lower()

        if "balance" in q:
            return f"Your current balance is ₹{account.balance:.2f}"

        if "transactions" not in q:
            for keyword, txn_type, label in (
                ("transfer", "transfer", "transfer"),
                ("deposit", "deposit", "deposit"),
                ("withdraw", "withdraw", "withdrawal"),
            ):
                if keyword in q:
                    txn = next(
                        (t for t in transactions if t.transaction_type.lower() == txn_type),
                        None
                    )
                    if not txn:
                        return f"No {label} transactions found."
                    return f"Here is your last {label}:\n\n{format_transaction(txn)}"

        if "transaction" in q or "history" in q or "recent" in q:
            if not transactions:
                return "No recent transactions found."
            formatted = "\n".join(format_transaction(txn) for txn in transactions[:5])
            return f"Here are your recent transactions:\n\n{formatted}"

        if re.search(r"\b(hi|hello|hey)\b", q):
            return "Hello! How can I help you today?"

        return "I can help you with balance, transactions, deposits, withdrawals, or transfers."
