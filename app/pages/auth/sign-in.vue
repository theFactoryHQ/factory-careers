<script setup lang="ts">
definePageMeta({
    layout: "auth",
    middleware: ["guest"],
});

useSeoMeta({
<<<<<<< HEAD
    title: "Admin Login",
    description: "Sign in to Factory Careers with Factory SSO",
=======
    title: "Sign In — Factory Careers",
    description: "Sign in to Factory Careers",
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
    robots: "noindex, nofollow",
});

const FACTORY_SSO_PROVIDER_ID = "thefactoryhq-sso";

const error = ref("");
const ssoRedirecting = ref(false);
const route = useRoute();
const localePath = useLocalePath();
const { track } = useTrack();

onMounted(() => {
    track("signin_page_viewed");

    const ssoError = route.query.error as string | undefined;
    if (!ssoError) return;

    const description = route.query.error_description as string | undefined;
    const normalizedError = ssoError.replace(/\+/g, " ");
    error.value =
        description?.replace(/\+/g, " ") ||
        (normalizedError === "account not linked"
            ? "That Microsoft account is not linked to Factory Careers yet. Ask an owner for an invitation, then try again."
            : "SSO authentication failed. Please try again.");
});

<<<<<<< HEAD
async function handleFactorySso() {
=======
async function handleSignIn() {
    error.value = "";

    if (!email.value || !password.value) {
        error.value = "Email and password are required.";
        return;
    }

    isLoading.value = true;

    let result: Awaited<ReturnType<typeof authClient.signIn.email>>;
    try {
        result = await authClient.signIn.email({
            email: email.value,
            password: password.value,
        });
    } catch (e: unknown) {
        error.value =
            e instanceof Error ? e.message : "Sign-in failed. Please try again.";
        isLoading.value = false;
        return;
    }

    if (result.error) {
        if (result.error.status === 500) {
            error.value =
                result.error.message && result.error.message !== "Server Error"
                    ? result.error.message
                    : 'Sign-in failed due to a server error. Make sure BETTER_AUTH_URL is set to "https://careers.thefactoryhq.com" in production and redeploy.';
        } else {
            error.value =
                result.error.message ??
                "Invalid credentials. Please try again.";
        }
        isLoading.value = false;
        return;
    }

    clearNuxtData();

    track("signin_completed");

    // If the user was accepting an invitation, redirect back to accept it
    const pendingInvitation = route.query.invitation as string | undefined;
    if (pendingInvitation) {
        await navigateTo(
            localePath(`/auth/accept-invitation/${pendingInvitation}`),
        );
    } else {
        await navigateTo(localePath("/dashboard"));
    }
}

/**
 * Self-hosted OIDC SSO — global provider configured via env vars.
 */
async function handleSelfHostedSso() {
    isLoading.value = true;
    error.value = "";
    const pendingInvitation = route.query.invitation as string | undefined;
    const callbackURL = pendingInvitation
        ? localePath(`/auth/accept-invitation/${pendingInvitation}`)
        : localePath("/dashboard");
    try {
        await authClient.signIn.oauth2({
            providerId: "oidc",
            callbackURL,
        });
    } catch (e: unknown) {
        error.value =
            e instanceof Error
                ? e.message
                : "SSO sign-in failed. Please try again.";
        isLoading.value = false;
    }
}

/**
 * Enterprise SSO — per-organization provider routing by email domain.
 * Uses Better Auth's SSO plugin: signIn.sso({ email, callbackURL })
 */
async function handleEnterpriseSso() {
    if (!email.value) {
        error.value =
            "Enter your work email address to sign in with SSO.";
        return;
    }

>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
    ssoRedirecting.value = true;
    error.value = "";

    const pendingInvitation = route.query.invitation as string | undefined;
    const callbackURL = pendingInvitation
        ? localePath(`/auth/accept-invitation/${pendingInvitation}`)
        : localePath("/dashboard");
    const errorCallbackURL = pendingInvitation
        ? localePath(`/auth/sign-in?invitation=${encodeURIComponent(pendingInvitation)}`)
        : localePath("/auth/sign-in");

    try {
        const result = await authClient.signIn.sso({
            providerId: FACTORY_SSO_PROVIDER_ID,
            callbackURL,
            errorCallbackURL,
            providerType: "oidc",
        });

        if (result.error) {
            error.value =
                result.error.message ??
<<<<<<< HEAD
                "Microsoft SSO is not available yet. Ask an owner to check the SSO configuration.";
=======
            "No SSO provider found for this email domain. Use Microsoft SSO or an invitation link.";
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
            ssoRedirecting.value = false;
            return;
        }

        const redirectUrl = result.data?.url;
        if (redirectUrl) {
            await navigateTo(redirectUrl, { external: true });
            return;
        }

        track("signin_sso_started");
    } catch (e: unknown) {
        error.value =
            e instanceof Error
                ? e.message
                : "Microsoft SSO sign-in failed. Please try again.";
        ssoRedirecting.value = false;
    }
}
</script>

<template>
<<<<<<< HEAD
    <form class="flex flex-col gap-5" @submit.prevent="handleFactorySso">
=======
    <form class="flex flex-col gap-4" @submit.prevent="handleSignIn">
        <h2
            class="text-xl font-semibold text-center text-surface-900 dark:text-surface-100 mb-2"
        >
            Sign in to Factory Careers
        </h2>

>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
        <div
            v-if="error"
            class="border border-danger-500/35 bg-danger-950/50 p-3 text-sm leading-6 text-danger-100"
        >
            {{ error }}
        </div>

        <button
            type="submit"
            :disabled="ssoRedirecting"
            class="factory-microsoft-signin-button inline-flex min-h-12 cursor-pointer items-center justify-center gap-3 border border-[#8c8c8c] bg-white px-4 py-3 text-[15px] font-semibold tracking-normal text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f7f7f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-60"
        >
            <svg class="size-5 shrink-0" viewBox="0 0 23 23" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
            </svg>
            {{ ssoRedirecting ? "Redirecting..." : "Continue with Microsoft" }}
        </button>

<<<<<<< HEAD
        <p class="text-center text-xs leading-5 text-white/42">
            Need access? Ask a Factory Careers owner to invite your work account.
=======
        <!-- Enterprise SSO button — always available on cloud, uses per-org providers -->
        <template v-if="!oidcEnabled">
            <div class="relative">
                <div class="absolute inset-0 flex items-center">
                    <div
                        class="w-full border-t border-surface-200 dark:border-surface-700"
                    />
                </div>
                <div class="relative flex justify-center text-xs">
                    <span
                        class="bg-white dark:bg-surface-900 px-2 text-surface-400"
                        >or</span
                    >
                </div>
            </div>

            <button
                type="button"
                :disabled="ssoRedirecting"
                class="px-4 py-2.5 bg-surface-900 dark:bg-white text-white dark:text-surface-900 rounded-lg text-sm font-semibold shadow-md cursor-pointer hover:bg-surface-800 dark:hover:bg-surface-100 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 ring-1 ring-surface-700 dark:ring-surface-300"
                @click="handleEnterpriseSso"
            >
                <ShieldCheck class="size-4" />
                {{ ssoRedirecting ? "Redirecting to your IdP…" : "Sign in with SSO" }}
                <span v-if="!ssoRedirecting" class="inline-flex items-center rounded-full bg-white/15 dark:bg-surface-900/15 px-1.5 py-0.5 text-[10px] font-medium text-white/80 dark:text-surface-900/80 ring-1 ring-white/20 dark:ring-surface-900/20">Beta</span>
            </button>
        </template>

        <p class="text-center text-sm text-surface-500 dark:text-surface-400">
            Need access?
            <NuxtLink
                :to="
                    route.query.invitation
                        ? $localePath({
                              path: '/auth/sign-up',
                              query: { invitation: route.query.invitation },
                          })
                        : $localePath('/auth/sign-up')
                "
                class="text-brand-600 dark:text-brand-400 hover:underline"
                >Use an invitation link</NuxtLink
            >
>>>>>>> cd599d8 (feat: brand factory careers reqcore fork)
        </p>
    </form>
</template>
