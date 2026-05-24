<script setup lang="ts">
definePageMeta({
    layout: "auth",
    middleware: ["guest"],
});

useSeoMeta({
    title: "Admin Login",
    description: "Sign in to Factory Careers with Factory SSO",
    robots: "noindex, nofollow",
});

const FACTORY_SSO_PROVIDER_ID = "thefactoryhq-sso";

const ssoRedirecting = ref(false);
const route = useRoute();
const localePath = useLocalePath();
const { track } = useTrack();
const toast = useToast();

function showSignInError(message: string, details?: string) {
    toast.error("Microsoft sign-in failed", { message, details });
}

function getSafeRedirectPath(value: unknown): string | null {
    if (typeof value !== "string") return null;
    if (!value.startsWith("/") || value.startsWith("//")) return null;
    return value;
}

onMounted(() => {
    track("signin_page_viewed");

    const ssoError = route.query.error as string | undefined;
    if (!ssoError) return;

    const description = route.query.error_description as string | undefined;
    const normalizedError = ssoError.replace(/\+/g, " ");
    showSignInError(
        description?.replace(/\+/g, " ") ||
        (normalizedError === "account not linked"
            ? "That Microsoft account is not linked to Factory Careers yet. Ask an owner for an invitation, then try again."
            : "SSO authentication failed. Please try again."),
        normalizedError,
    );
});

async function handleFactorySso() {
    ssoRedirecting.value = true;

    const pendingInvitation = route.query.invitation as string | undefined;
    const safeRedirect = getSafeRedirectPath(route.query.redirect);
    const callbackURL = pendingInvitation
        ? localePath(`/auth/accept-invitation/${pendingInvitation}`)
        : safeRedirect
            ? localePath(safeRedirect)
        : localePath("/dashboard");
    const errorCallbackURL = pendingInvitation
        ? localePath(`/auth/sign-in?invitation=${encodeURIComponent(pendingInvitation)}`)
        : safeRedirect
            ? localePath(`/auth/sign-in?redirect=${encodeURIComponent(safeRedirect)}`)
        : localePath("/auth/sign-in");

    try {
        const result = await authClient.signIn.sso({
            providerId: FACTORY_SSO_PROVIDER_ID,
            callbackURL,
            errorCallbackURL,
            providerType: "oidc",
        });

        if (result.error) {
            showSignInError(
                result.error.message ??
                "Microsoft SSO is not available yet. Ask an owner to check the SSO configuration.",
                result.error.code,
            );
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
        showSignInError(
            e instanceof Error
                ? e.message
                : "Microsoft SSO sign-in failed. Please try again.",
        );
        ssoRedirecting.value = false;
    }
}
</script>

<template>
    <form class="flex flex-col gap-5" @submit.prevent="handleFactorySso">
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

        <p class="text-center text-xs leading-5 text-white/42">
            Need access? Ask a Factory Careers owner to invite your work account.
        </p>
    </form>
</template>
