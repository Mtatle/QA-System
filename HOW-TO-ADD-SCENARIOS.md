# 📋 How to Add New Scenarios - Simple Framework

## 🎯 Quick Steps

### 1. Choose Your Categories
You have exactly 8 categories to choose from:

```
send_to_cs           →  📬 SEND TO CS
escalate             →  🛑 ESCALATE  
tone                 →  📢 TONE
templates            →  ⚡ TEMPLATES
dos_and_donts        →  ✅ DOs AND DON'Ts
drive_to_purchase    →  🛒 DRIVE TO PURCHASE
promo_and_exclusions →  ✨ PROMO & PROMO EXCLUSIONS
important            →  🚨 IMPORTANT
```

### 2. Add to scenarios.json
1) Open file: scenarios.json  
2) Find the highest scenario number (e.g. if last is "5", your new one is "6")  
3) Paste a new block following this pattern:

```json
    "EXAMPLE_SCENARIO": {
      "companyName": "Company Name",
      "agentName": "Agent Name",
      "customerPhone": "+1 (555) 123-4567",
      "customerMessage": "Customer's initial message here...",
      "customerFollowUpMessage": "Customer's second message here (optional)",
      "guidelines": {
        "send_to_cs": [
          "Forward billing questions to CS team",
          "Transfer technical issues beyond basic troubleshooting",
          "Escalate refund requests over $100"
        ],
        "tone": [
          "Be empathetic and understanding",
          "Use professional but warm language",
          "Acknowledge customer frustration"
        ],
        "templates": [
          "Use shipping delay template for delivery issues",
          "Use refund template for return requests",
          "Use technical support template for product issues"
        ]
      },
      "rightPanel": {
        "source": {
          "label": "Source",
          "value": "Chat initiated by customer",
          "date": "08/04/25"
        },
        "recommended": [
          "Product recommendation 1",
          "Product recommendation 2",
          "Product recommendation 3"
        ],
        "browsingHistory": [
          {
            "item": "Tracking: Package QS123456",
            "timeAgo": "1 h ago",
            "icon": "truck"
          },
          {
            "item": "USPS Tracking Portal",
            "timeAgo": "3 h ago",
            "icon": "external-link"
          },
          {
            "item": "Previous Support Chat",
            "timeAgo": "2 d ago",
            "icon": "message-circle"
          }
        ],
        "promotions": {
          "title": "Promotion title (e.g., Summer Sale)",
          "active_status": "active",
          "code": "PROMO2025",
          "content": [
            "Short bullet 1 about the promotion",
            "Short bullet 2 about the promotion"
          ]
        },
        "templates": [
          {
            "name": "Warm greeting",
            "shortcut": "grt",
            "content": "Hi {first_name}, thanks for reaching out — happy to help!"
          },
          {
            "name": "Order status",
            "shortcut": "ord",
            "content": "I can help with your order. Could you share your order number so I can take a look?"
          },
          {
            "name": "Refund ETA",
            "shortcut": "eta",
            "content": "I've initiated your refund. You'll see it reflected in 5–7 business days."
          }
        ]
      }
    }
```

```md
## How to add it step-by-step

1) Open: scenarios.json
2) Inside "scenarios": { ... }, go to the end of the last scenario block.
3) If there is no comma after the last scenario’s closing }, add a comma.
4) Press Enter, then paste the whole block above.
5) Change "EXAMPLE_SCENARIO" to the next number in quotes, like "6": { ... }
6) Edit the text inside quotation marks to fit your case (companyName, messages, guidelines, rightPanel, etc.).
7) To add more items to guidelines or templates:
   - Add a new line inside the list, put your text in quotes, and add a comma if it’s not the last item.
8) Commit changes with the green button on the top right
```
