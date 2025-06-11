import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { server } from "@/testUtils/server";
import { createMockRouter } from "@/testUtils/createMockRouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe, toHaveNoViolations } from "jest-axe";
import Page from "../page";

expect.extend(toHaveNoViolations);

let router: ReturnType<typeof createMockRouter>;

jest.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const renderPage = () => {
  router = createMockRouter();
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Page />
    </QueryClientProvider>
  );
};

describe("Schedule Overview Page", () => {
  describe("Initial rendering", () => {
    it("renders default overview form fields", () => {
      // Arrange
      renderPage();
      // Assert
      expect(
        screen.getByRole("heading", { name: /schedule overview/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/title/i)).toHaveValue("");
      expect(screen.getByLabelText(/start date/i)).toHaveValue("");
      expect(screen.getByLabelText(/end date/i)).toHaveValue("");
      expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    });
  });

  describe("Validation", () => {
    it("shows error when title exceeds max length", async () => {
      // Arrange
      renderPage();
      const titleInput = screen.getByLabelText(/title/i);
      const maxLength = 100; // adjust to component constraint
      // Act
      userEvent.type(titleInput, "a".repeat(maxLength + 1));
      fireEvent.blur(titleInput);
      // Assert
      expect(
        await screen.findByText(
          new RegExp(`max length of ${maxLength} characters`, "i")
        )
      ).toBeInTheDocument();
    });

    it("disables submit and shows error when end date is before start date", async () => {
      // Arrange
      renderPage();
      // Act
      userEvent.type(screen.getByLabelText(/start date/i), "2025-01-10");
      userEvent.type(screen.getByLabelText(/end date/i), "2025-01-05");
      fireEvent.blur(screen.getByLabelText(/end date/i));
      // Assert
      expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
      expect(
        await screen.findByText(/end date must be after start date/i)
      ).toBeInTheDocument();
    });

    it("prevents submit and shows required field errors when empty fields", async () => {
      // Arrange
      renderPage();
      // Act
      userEvent.click(screen.getByRole("button", { name: /create/i }));
      // Assert
      expect(await screen.findAllByText(/required/i)).not.toHaveLength(0);
      expect(router.push).not.toHaveBeenCalled();
    });
  });

  describe("Submission", () => {
    it("submits form and navigates to confirmation on success", async () => {
      // Arrange
      server.use(
        rest.post("/api/schedule", (req, res, ctx) => res(ctx.status(201)))
      );
      renderPage();
      userEvent.type(screen.getByLabelText(/title/i), "New schedule");
      userEvent.type(screen.getByLabelText(/start date/i), "2025-01-01");
      userEvent.type(screen.getByLabelText(/end date/i), "2025-01-02");
      // Act
      userEvent.click(screen.getByRole("button", { name: /create/i }));
      // Assert
      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith("/schedule/confirmation")
      );
    });

    it("shows toast on API error", async () => {
      // Arrange
      server.use(
        rest.post("/api/schedule", (req, res, ctx) => res(ctx.status(500)))
      );
      renderPage();
      userEvent.type(screen.getByLabelText(/title/i), "Test schedule");
      userEvent.type(screen.getByLabelText(/start date/i), "2025-01-01");
      userEvent.type(screen.getByLabelText(/end date/i), "2025-01-02");
      // Act
      userEvent.click(screen.getByRole("button", { name: /create/i }));
      // Assert
      expect(
        await screen.findByRole("alert")
      ).toHaveTextContent(/failed to create/i);
    });
  });

  describe("Conditional rendering", () => {
    it("reveals recurring fields when recurring toggle is enabled", () => {
      // Arrange
      renderPage();
      // Act
      userEvent.click(screen.getByLabelText(/recurring schedule/i));
      // Assert
      expect(
        screen.getByLabelText(/recurrence pattern/i)
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      // Arrange
      const { container } = renderPage();
      // Act & Assert
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});