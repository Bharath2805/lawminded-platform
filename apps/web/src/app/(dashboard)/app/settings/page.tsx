import { PrivacyControls } from "@/components/privacy/privacy-controls";

export default function SettingsPage() {
  return (
    <section className="section">
      <div className="shell prose-page">
        <p className="eyebrow">Settings</p>
        <h1>Privacy and account controls</h1>
        <p>
          Manage consent preferences, request data exports, and submit privacy
          rights requests from one place.
        </p>
        <PrivacyControls />
      </div>
    </section>
  );
}
