import Stripe from "stripe";
import mongoose from "mongoose";
import { fulfillTransaction } from "./creditController.js";

//Add the credits for a Checkout Session started by this app, if it has been paid.
//Safe to call any number of times for the same session: fulfillTransaction only
//adds credits once. Returns a short note for the webhook response.
const fulfillCheckoutSession = async (session) => {
  const { transactionId, appId } = session?.metadata || {};

  if (appId !== "quickgpt" || !mongoose.isValidObjectId(transactionId)) {
    return "ignored: not a purchase from this app";
  }
  //async payment methods complete later; checkout.session.async_payment_succeeded follows
  if (session.payment_status !== "paid") {
    return "ignored: payment not completed yet";
  }

  const fulfilled = await fulfillTransaction(transactionId);
  return fulfilled
    ? "credits added"
    : "ignored: already fulfilled or unknown transaction";
};

export const stripeWebHooks = async (req, res) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  //Everything below acknowledges with 200 unless something unexpected fails
  //(e.g. the database is down); then a 500 makes Stripe retry, which is safe.
  try {
    let result;

    switch (event.type) {
      //The session (with our metadata) comes with the event, no lookup needed
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        result = await fulfillCheckoutSession(event.data.object);
        break;
      }

      //Kept so purchases are still credited while the Stripe endpoint is
      //subscribed only to this event. Payments not made through Checkout
      //have no session and are ignored.
      case "payment_intent.succeeded": {
        const sessionList = await stripe.checkout.sessions.list({
          payment_intent: event.data.object.id,
          limit: 1,
        });
        const session = sessionList.data[0];
        result = session
          ? await fulfillCheckoutSession(session)
          : "ignored: payment not made through Checkout";
        break;
      }

      default:
        result = `ignored: unhandled event type ${event.type}`;
        break;
    }

    res.json({ received: true, result });
  } catch (error) {
    console.error("Webhook processing error: ", error);
    res.status(500).send("Internal Server Error");
  }
};
