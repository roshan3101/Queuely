import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import Page from "./page";

vi.mock("next/navigation", () => ({
  useRouter() {
    return { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
  },
}));

describe("Landing page", () => {
  it("renders a loading state while redirecting", () => {
    render(<Page />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});
