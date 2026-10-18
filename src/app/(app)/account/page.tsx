import { requirePage } from "@/server/auth";
import { PageHeader } from "@/components/app/page-header";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requirePage();
  return (
    <>
      <PageHeader title="Your account" description={`Signed in as ${actor.name}`} />
      <PasswordForm />
    </>
  );
}
