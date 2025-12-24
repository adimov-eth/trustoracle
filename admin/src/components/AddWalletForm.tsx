import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { createWallet } from "../lib/api";

const schema = z.object({
  address: z.string().min(1, "Address is required").regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address format"),
  riskLevel: z.enum(["UNKNOWN", "GREEN", "YELLOW", "RED"]),
  validUntil: z.string().min(1, "Valid until date is required"),
  countryCode: z.string().length(2, "Country code must be 2 characters")
});

type FormValues = z.infer<typeof schema>;

export function AddWalletForm({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      address: "",
      riskLevel: "GREEN",
      validUntil: toLocalInput(nowPlusDays(30)),
      countryCode: "US"
    }
  });

  const countryField = form.register("countryCode");

  const handleSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    setError(null);

    const validUntil = parseDate(values.validUntil);
    if (!validUntil) {
      setError("Enter a valid expiration date.");
      setIsSubmitting(false);
      return;
    }

    try {
      await createWallet({
        address: values.address,
        riskLevel: values.riskLevel,
        validUntil,
        countryCode: values.countryCode.toUpperCase()
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Add new wallet</h3>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            Wallet address
            <input
              placeholder="0x..."
              {...form.register("address")}
            />
            {form.formState.errors.address && (
              <span className="muted" style={{ color: "var(--red)", fontSize: "0.85em" }}>
                {form.formState.errors.address.message}
              </span>
            )}
          </label>
          <label>
            Risk level
            <select {...form.register("riskLevel")}>
              <option value="UNKNOWN">UNKNOWN</option>
              <option value="GREEN">GREEN</option>
              <option value="YELLOW">YELLOW</option>
              <option value="RED">RED</option>
            </select>
          </label>
          <label>
            Valid until
            <input type="datetime-local" {...form.register("validUntil")} />
          </label>
          <label>
            Country code
            <input
              maxLength={2}
              placeholder="US"
              {...countryField}
              onChange={(event) => {
                event.target.value = event.target.value.toUpperCase();
                countryField.onChange(event);
              }}
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create wallet"}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseDate(value: string): number | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.floor(timestamp / 1000);
}

function toLocalInput(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function nowPlusDays(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

function extractError(error: unknown): string {
  if (!error) return "Request failed";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Request failed";
}
