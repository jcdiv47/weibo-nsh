// What the app does with the account signed in, from more than one page.
import { AlertDialog } from "nsh/base";
import { t } from "nsh/i18n";
import { signOut } from "../bridge";

/** Asks first, then signs out (the timeline's menu and my profile's). */
export async function confirmSignOut() {
  const { action } = await AlertDialog.show({
    title: t("menu.sign_out_title"),
    description: t("menu.sign_out_description"),
    actions: [
      { id: "cancel", label: t("common.cancel"), role: "cancel" },
      { id: "ok", label: t("menu.sign_out"), role: "destructive" },
    ],
  });
  if (action === "ok") signOut();
}
