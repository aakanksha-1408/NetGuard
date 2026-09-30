/** Extra investigator strings merged into scamChatbot in en. */

export const investigatorEn = {
  confReasons: {
    multiple: "Multiple strong scam indicators detected with high confidence.",
    several: "Several scam indicators found, but some indicators are ambiguous.",
    limited: "Limited indicators detected. The message may still be a scam — stay cautious.",
    none: "No strong scam indicators found. This assessment has low confidence.",
    empty: "No content to analyse.",
  },
  flagMap: {
    "Urgency pressure": {
      label: "Urgency pressure",
      explanation: "The message pressures you to act immediately without thinking.",
      education: "Scammers create artificial urgency so victims don't have time to verify the request. Legitimate organisations give reasonable deadlines.",
    },
    "Threat / intimidation": {
      label: "Threat / intimidation",
      explanation: "The message threatens negative consequences to create fear.",
      education: "Scammers use threats to panic victims into compliance. Real banks and government agencies never threaten immediate arrest or account closure via text.",
    },
    "OTP / verification code request": {
      label: "OTP / verification code request",
      explanation: "The message asks you to share a verification code or OTP.",
      education: "Legitimate organisations never ask you to share OTPs. OTPs are the final security barrier — sharing them gives full account access to the scammer.",
    },
    "Sensitive credential request": {
      label: "Sensitive credential request",
      explanation: "The message requests passwords, PINs, card numbers, or login credentials.",
      education: "No legitimate service will ever ask for your password, PIN, or full card number through a message.",
    },
    "Payment / money request": {
      label: "Payment / money request",
      explanation: "The sender is requesting money or a financial transfer.",
      education: "Unsolicited requests for money are a core scam tactic. Once sent, money transfers are nearly impossible to reverse.",
    },
    "Lottery / prize claim": {
      label: "Lottery / prize claim",
      explanation: "The message claims you've won a prize or been selected for a reward.",
      education: "You cannot win a lottery you never entered. 'Congratulations, you've won' messages are among the most common scams.",
    },
    "Investment promise": {
      label: "Investment promise",
      explanation: "The message promises unusually high or guaranteed investment returns.",
      education: "No legitimate investment guarantees returns. High-return promises are hallmarks of investment fraud.",
    },
    "Suspicious job offer": {
      label: "Suspicious job offer",
      explanation: "The message contains indicators of a fake job or employment scam.",
      education: "Fake job scams lure victims with high pay, then demand fees or personal documents. Real employers never charge you to get a job.",
    },
    "KYC / account update request": {
      label: "KYC / account update request",
      explanation: "The message asks you to update or verify KYC, PAN, or account details.",
      education: "Always update KYC through the official app or branch only — never through a link in a message.",
    },
    "Government impersonation": {
      label: "Government impersonation",
      explanation: "The message impersonates a government agency or authority.",
      education: "Government agencies do not contact individuals about refunds or fines via WhatsApp, SMS, or email.",
    },
    "Delivery / courier scam indicator": {
      label: "Delivery / courier scam indicator",
      explanation: "The message references a package, delivery, or customs fee.",
      education: "Legitimate courier companies do not ask for payments via WhatsApp or SMS links.",
    },
    "Tech support impersonation": {
      label: "Tech support impersonation",
      explanation: "The message claims your device has a problem and offers remote 'support'.",
      education: "Microsoft, Google, and Apple never contact you about virus issues via unsolicited messages.",
    },
    "Romance / emotional manipulation": {
      label: "Romance / emotional manipulation",
      explanation: "The message uses romantic or emotional language typical of romance scams.",
      education: "Romance scammers build trust, then request money. Be cautious of strangers who quickly express strong feelings.",
    },
    "Cryptocurrency reference": {
      label: "Cryptocurrency reference",
      explanation: "The message references cryptocurrency, wallets, or blockchain investments.",
      education: "Once crypto is sent, it cannot be reversed. Be extremely cautious of unsolicited crypto messages.",
    },
    "Shortened / hidden URL": {
      label: "Shortened / hidden URL",
      explanation: "The message contains a shortened link that hides the real destination.",
      education: "Never click shortened links from unknown senders.",
    },
    "Suspicious domain extension": {
      label: "Suspicious domain extension",
      explanation: "The link uses a domain extension commonly associated with scam sites.",
      education: "Always check the exact domain and open the official website independently.",
    },
    "Phishing-style URL": {
      label: "Phishing-style URL",
      explanation: "The URL contains banking/verification keywords on a suspicious domain.",
      education: "Phishing sites mimic real bank or service addresses. Check the exact domain carefully.",
    },
    "Personal identity information request": {
      label: "Personal identity information request",
      explanation: "The message requests sensitive personal identity information.",
      education: "Aadhaar, PAN, and date of birth can be used for identity theft. Do not share them in messages.",
    },
    "Bank name reference": {
      label: "Bank name reference",
      explanation: "The message references a specific bank — possibly impersonating it.",
      education: "Always verify by calling the bank's official helpline from their website, not from the message.",
    },
    "Payment platform reference": {
      label: "Payment platform reference",
      explanation: "The message references a payment platform (UPI, Paytm, etc.).",
      education: "Never approve a UPI collect request from an unknown sender.",
    },
  },
};
