import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("Dashboard page", () => {
  it("renders the app title", () => {
    render(<Page />);
    expect(screen.getByText("Queuely")).toBeInTheDocument();
  });
});
