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

const ssoRedirecting = ref(false);
const route = useRoute();
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

const factorySsoUrl = computed(() => {
    const params = new URLSearchParams();
    const pendingInvitation = route.query.invitation as string | undefined;
    const safeRedirect = getSafeRedirectPath(route.query.redirect);

    if (pendingInvitation) params.set("invitation", pendingInvitation);
    if (safeRedirect) params.set("redirect", safeRedirect);

    const query = params.toString();
    return query ? `/api/auth/factory-sso?${query}` : "/api/auth/factory-sso";
});

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

function handleFactorySso() {
    ssoRedirecting.value = true;
    track("signin_sso_started");
}
</script>

<template>
    <form class="flex flex-col gap-5" method="get" :action="factorySsoUrl" @submit="handleFactorySso">
        <button
            type="submit"
            :disabled="ssoRedirecting"
            data-slot="button"
            data-hover-effect="slide"
            aria-label="Sign in with Microsoft"
            :aria-busy="ssoRedirecting"
            class="factory-microsoft-signin-button inline-flex min-h-12 cursor-pointer items-center justify-center gap-3 border border-transparent bg-white px-4 py-3 text-[15px] font-semibold tracking-normal text-[#1f1f1f] shadow-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
            <svg class="size-5 shrink-0" viewBox="0 0 23 23" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
            </svg>
            <span>{{ ssoRedirecting ? "Redirecting..." : "Sign in with Microsoft" }}</span>
        </button>

        <p class="text-center text-xs leading-5 text-white/42">
            Need access? Ask a Factory Careers owner to invite your work account.
        </p>
    </form>
</template>
