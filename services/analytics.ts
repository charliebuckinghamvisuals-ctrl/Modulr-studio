import { logEvent, setUserProperties } from "firebase/analytics";
import { analytics } from "./firebase";

/**
 * Tracks a user signing up for an account.
 */
export const trackSignUp = (method: string = 'email') => {
    if (analytics) {
        logEvent(analytics, 'sign_up', { method });
    }
};

/**
 * Tracks a user logging into their account.
 */
export const trackLogin = (method: string = 'email') => {
    if (analytics) {
        logEvent(analytics, 'login', { method });
    }
};

/**
 * Sets the current plan as a user property for segmenting data.
 */
export const trackUserPlan = (plan: string) => {
    if (analytics) {
        setUserProperties(analytics, { 
            user_plan: plan || 'free'
        });
    }
};

/**
 * Tracks when a user starts the checkout process for a specific plan.
 */
export const trackBeginCheckout = (planName: string, value: number) => {
    if (analytics) {
        logEvent(analytics, 'begin_checkout', {
            items: [{ item_name: planName }],
            value: value,
            currency: 'GBP'
        });
    }
};

/**
 * Tracks general feature usage (e.g. 'render_engine', 'line_converter').
 */
export const trackFeatureUsage = (featureName: string) => {
    if (analytics) {
        logEvent(analytics, 'feature_usage', { feature_name: featureName });
    }
};
