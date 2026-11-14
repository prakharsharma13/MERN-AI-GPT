import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import Stripe from "stripe";

const plans = [
  {
    _id: "basic",
    name: "Basic",
    price: 10,
    credits: 100,
    features: [
      "100 credits included",
      "Up to 100 text generations (1 credit each)",
      "Up to 50 image generations (2 credits each)",
      "Full chat history & community access",
    ],
  },
  {
    _id: "pro",
    name: "Pro",
    price: 20,
    credits: 500,
    features: [
      "500 credits included",
      "Up to 500 text generations (1 credit each)",
      "Up to 250 image generations (2 credits each)",
      "Full chat history & community access",
    ],
  },
  {
    _id: "premium",
    name: "Premium",
    price: 30,
    credits: 1000,
    features: [
      "1000 credits included",
      "Up to 1000 text generations (1 credit each)",
      "Up to 500 image generations (2 credits each)",
      "Full chat history & community access",
    ],
  },
];

//-----------------Controller for getting all plans----------------
export const getPlans = async (req, res) => {
  try {
    res.json({ success: true, plans });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//-----------------Controller for purchasing a plan----------------
export const purchasePlan = async (req, res) => {
  const { planId } = req.body;
  const userId = req.user._id;

  try {
    const plan = plans.find((plan) => plan._id === planId);
    if (!plan) {
      return res.json({ success: false, message: "Invalid plan" });
    }

    const transaction = await Transaction.create({
      userId,
      planId: plan._id,
      amount: plan.price,
      credits: plan.credits,
      isPaid: false,
    });

    const { origin } = req.headers;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: plan.price * 100,
            product_data: {
              name: plan.name,
            },
          },
          quantity: 1,
        },
      ],
      //Stripe fills in {CHECKOUT_SESSION_ID}; the Loading page uses it to confirm the payment
      success_url: `${origin}/loading?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}`,
      metadata: {
        transactionId: transaction._id.toString(),
        appId: "quickgpt",
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      mode: "payment",
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

//Mark a transaction as paid and add its credits, exactly once.
//Both the Stripe webhook and verifyPurchase call this, in either order.
export const fulfillTransaction = async (transactionId) => {
  //atomic claim, so two concurrent callers can't both add the credits
  const transaction = await Transaction.findOneAndUpdate(
    { _id: transactionId, isPaid: false },
    { isPaid: true },
  );
  if (!transaction) return false; //already fulfilled (or unknown)

  try {
    await User.updateOne(
      { _id: transaction.userId },
      { $inc: { credits: transaction.credits } },
    );
  } catch (error) {
    //release the claim so a retry (e.g. Stripe resending the webhook) can add the credits
    await Transaction.updateOne({ _id: transactionId }, { isPaid: false });
    throw error;
  }
  return true;
};

//-----------------Controller for confirming a purchase on return from Checkout----------------
//Doesn't wait for the webhook: checks the Checkout Session with Stripe directly.
export const verifyPurchase = async (req, res) => {
  const { sessionId } = req.body;

  try {
    if (typeof sessionId !== "string" || !sessionId) {
      return res.json({ success: false, message: "Missing checkout session" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const { transactionId, appId } = session.metadata || {};
    const transaction =
      appId === "quickgpt" && transactionId
        ? await Transaction.findById(transactionId)
        : null;

    //only the user who started the purchase can confirm it
    if (!transaction || !transaction.userId.equals(req.user._id)) {
      return res.json({ success: false, message: "Purchase not found" });
    }

    if (session.payment_status !== "paid") {
      return res.json({
        success: false,
        pending: true,
        message: "Payment is still processing",
      });
    }

    await fulfillTransaction(transactionId);
    const user = await User.findById(req.user._id);
    res.json({ success: true, credits: user.credits });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
