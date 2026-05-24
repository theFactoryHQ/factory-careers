<script setup lang="ts">
definePageMeta({
  layout: "auth",
});

useSeoMeta({
  title: "Authorize CLI Device",
  description: "Approve a Factory Careers CLI sign-in request",
  robots: "noindex, nofollow",
});

const route = useRoute();
const localePath = useLocalePath();
const toast = useToast();

const userCode = ref(
  typeof route.query.user_code === "string"
    ? route.query.user_code.toUpperCase()
    : "",
);
const verifying = ref(false);
const processing = ref<"approve" | "deny" | null>(null);
const verifiedCode = ref("");
const status = ref("");
const error = ref("");

const normalizedUserCode = computed(() =>
  userCode.value.trim().toUpperCase().replace(/\s+/g, ""),
);
const hasVerifiedPendingCode = computed(() =>
  verifiedCode.value === normalizedUserCode.value && status.value === "pending",
);

async function hasActiveSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/get-session", {
      credentials: "include",
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) return false;

    return !!(await response.json());
  } catch {
    return false;
  }
}

function redirectToSignIn() {
  const redirect = `/device?user_code=${encodeURIComponent(normalizedUserCode.value)}`;
  return navigateTo(localePath(`/auth/sign-in?redirect=${encodeURIComponent(redirect)}`));
}

async function verifyCode() {
  error.value = "";
  status.value = "";
  verifiedCode.value = "";

  if (!normalizedUserCode.value) {
    error.value = "Enter the code shown in your terminal.";
    return;
  }

  if (!await hasActiveSession()) {
    await redirectToSignIn();
    return;
  }

  verifying.value = true;
  try {
    const result = await authClient.device({
      query: {
        user_code: normalizedUserCode.value,
      },
    });

    if (result.error) {
      error.value = result.error.error_description || "That device code is invalid or expired.";
      return;
    }

    verifiedCode.value = normalizedUserCode.value;
    status.value = result.data?.status || "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unable to verify this device code.";
  } finally {
    verifying.value = false;
  }
}

async function completeAuthorization(decision: "approve" | "deny") {
  if (!hasVerifiedPendingCode.value || processing.value) return;

  processing.value = decision;
  error.value = "";

  try {
    const result = decision === "approve"
      ? await authClient.device.approve({ userCode: verifiedCode.value })
      : await authClient.device.deny({ userCode: verifiedCode.value });

    if (result.error) {
      error.value = result.error.error_description || "Unable to update this device request.";
      return;
    }

    status.value = decision === "approve" ? "approved" : "denied";
    toast.success(
      decision === "approve" ? "CLI sign-in approved" : "CLI sign-in denied",
      decision === "approve"
        ? "You can return to your terminal."
        : "The requesting CLI will not receive access.",
    );
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unable to update this device request.";
  } finally {
    processing.value = null;
  }
}

onMounted(() => {
  if (normalizedUserCode.value) {
    void verifyCode();
  }
});
</script>

<template>
  <form class="flex flex-col gap-5" @submit.prevent="verifyCode">
    <div class="space-y-2">
      <label for="device-code">Device code</label>
      <input
        id="device-code"
        v-model="userCode"
        type="text"
        inputmode="text"
        autocomplete="one-time-code"
        placeholder="ABCD-2345"
        maxlength="16"
        class="text-center font-mono text-xl uppercase tracking-[0.16em]"
      />
      <p class="text-xs leading-5 text-white/42">
        Enter the code shown by the Factory Careers CLI.
      </p>
    </div>

    <button type="submit" :disabled="verifying || processing !== null">
      {{ verifying ? "Checking..." : hasVerifiedPendingCode ? "Code verified" : "Continue" }}
    </button>

    <div
      v-if="hasVerifiedPendingCode"
      class="border border-white/10 bg-white/[0.04] p-4"
    >
      <h2 class="text-base font-semibold text-white">Approve CLI access?</h2>
      <p class="mt-2 text-sm leading-6 text-white/52">
        A terminal session is requesting access to your Factory Careers account.
        Approve only if you started this sign-in.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="factory-auth-primary"
          :disabled="processing !== null"
          @click="completeAuthorization('approve')"
        >
          {{ processing === "approve" ? "Approving..." : "Approve" }}
        </button>
        <button
          type="button"
          class="factory-auth-outline"
          :disabled="processing !== null"
          @click="completeAuthorization('deny')"
        >
          {{ processing === "deny" ? "Denying..." : "Deny" }}
        </button>
      </div>
    </div>

    <div
      v-else-if="status === 'approved' || status === 'denied'"
      class="border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/64"
    >
      This device request was {{ status }}. You can close this page.
    </div>

    <p v-if="error" class="text-sm leading-6 text-danger-400">
      {{ error }}
    </p>
  </form>
</template>
