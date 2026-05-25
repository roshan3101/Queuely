import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import Page from "./app/page";

vi.mock("next/navigation", () => ({
  useRouter() {
    return { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
  },
}));

describe("Dashboard page", () => {
  it("renders the app title", () => {
    render(<Page />);
    expect(screen.getByText("Queuely")).toBeInTheDocument();
  });
});
