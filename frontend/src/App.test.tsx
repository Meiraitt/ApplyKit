import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";

const job = {
  id: "job1",
  title: "React Developer",
  company: "Acme",
  description: "Test description",
  language: "pt-BR",
  saved_at: "2026-10-15T01:00:00Z",
  generation_state: "ready",
  version_count: 1,
  generations: [
    {
      id: "cv1",
      state: "ready",
      created_at: "2026-10-15T01:00:00Z",
      downloadable: true,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/dashboard"))
        return Response.json({
          totals: { saved: 1, applied: 0, pending: 1, ready: 1 },
          weekly: [{ week: "2026-10-12", saved: 1, applied: 0 }],
        });

      if (url === "/api/jobs" && init?.method === "POST")
        return Response.json({ vacancy: job, duplicate: false });

      if (url === "/api/jobs") return Response.json([job]);

      if (url === "/api/profile")
        return Response.json({
          name: "Pessoa",
          headline: "Developer",
          notes: "",
        });

      if (url === "/api/jobs/job1") return Response.json(job);

      return Response.json({ error: "Failed" }, { status: 422 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

it("submits the selected date and blocks future applications", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let submitted: { appliedAt: string } | undefined;

  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/jobs/job1/application") {
      submitted = JSON.parse(String(init?.body));

      return Response.json(job);
    }

    return original(url, init);
  });

  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Acme React Developer/ }),
  );

  const field = await screen.findByLabelText("Application date");

  fireEvent.input(field, { target: { value: "2020-01-02" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Mark as applied" }),
  );

  await waitFor(() =>
    expect(submitted?.appliedAt).toBe(
      new Date("2020-01-02T00:00:00").toISOString(),
    ),
  );

  submitted = undefined;
  fireEvent.input(field, { target: { value: "2099-01-01" } });
  expect(field).toBeInvalid();
  await userEvent.click(
    screen.getByRole("button", { name: "Mark as applied" }),
  );

  expect(submitted).toBeUndefined();
});

it("accepts a URL and opens the saved job before generation finishes", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "New job" }));
  expect(
    screen.getByRole("button", { name: "Save and generate CV" }),
  ).toBeDisabled();

  await userEvent.type(
    screen.getByLabelText("Job URL optional"),
    "https://example.com/vaga",
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Save and generate CV" }),
  );

  expect(
    await screen.findByText("Job saved. Your CV is queued."),
  ).toBeInTheDocument();

  expect(
    await screen.findByRole("link", { name: "Download PDF" }),
  ).toHaveAttribute("href", "/api/generations/cv1/pdf");
});

it("opens details from cards, closes with Escape and preserves search", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /My jobs/ }));
  await userEvent.type(screen.getByLabelText("Search jobs"), "React");
  await userEvent.click(
    await screen.findByRole("button", { name: /Acme React Developer/ }),
  );

  const drawer = await screen.findByRole("dialog", {
    name: "Job details",
  });

  expect(
    await within(drawer).findByRole("link", { name: "Download DOCX" }),
  ).toBeInTheDocument();

  fireEvent(drawer, new Event("cancel", { bubbles: false, cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Search jobs")).toHaveValue("React");
});

it("shows weekly data as a table and changes the period", async () => {
  render(<App />);
  await userEvent.click(await screen.findByText("View data table"));
  expect(screen.getByRole("table")).toHaveTextContent("12/10");
  await userEvent.selectOptions(screen.getByLabelText("Chart period"), "4");

  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/dashboard?weeks=4",
      expect.anything(),
    ),
  );
});

it("shows history and filters applications", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "New job" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /My jobs/ })).toHaveTextContent(
      "1",
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: /My jobs/ }));
  expect(await screen.findByText("React Developer")).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText("Filter jobs"),
    "applied",
  );

  expect(screen.getByText("No jobs here yet")).toBeInTheDocument();
});

it("shows API errors when adding a job", async () => {
  const fetchMock = vi.mocked(fetch);

  fetchMock.mockImplementation(async (url, init) => {
    if (String(url).startsWith("/api/dashboard"))
      return Response.json({
        totals: { saved: 0, applied: 0, pending: 0, ready: 0 },
        weekly: [],
      });

    if (init?.method === "POST")
      return Response.json(
        { error: "Incomplete description" },
        { status: 400 },
      );

    return Response.json(String(url).endsWith("/jobs") ? [] : {});
  });

  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "New job" }));
  await userEvent.type(
    screen.getByLabelText("Job URL optional"),
    "https://example.com/vaga",
  );

  await userEvent.click(
    screen.getByRole("button", { name: "Save and generate CV" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Incomplete description",
  );
});

it("shows feedback and resumes the selected version", async () => {
  let repairing = false;
  const original = vi.mocked(fetch).getMockImplementation()!;
  const feedback = {
    approved: false,
    issues: [
      {
        severity: "blocking",
        section: "Resumo",
        problem: "Unsupported expertise.",
        fix: "Describe the experience without claiming expertise.",
      },
    ],
    strengths: [],
    missingRequirements: [],
    questionsForCandidate: [],
  };

  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/jobs/job1/repair") {
      expect(JSON.parse(init!.body as string)).toEqual({ generationId: "cv1" });
      repairing = true;

      return Response.json({ generationId: "cv2" });
    }

    if (String(url) === "/api/jobs/job1")
      return Response.json({
        ...job,
        generations: repairing
          ? [
              {
                id: "cv2",
                state: "queued",
                created_at: job.saved_at,
                repair_of: "cv1",
              },
            ]
          : [
              {
                ...job.generations[0],
                state: "needs_review",
                downloadable: false,
                can_repair: true,
                review: feedback,
              },
            ],
      });

    return original(url, init);
  });

  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Acme React Developer/ }),
  );

  expect(await screen.findByText("Unsupported expertise.")).toBeInTheDocument();

  expect(
    screen.getByText("Describe the experience without claiming expertise."),
  ).toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("button", { name: "Revise with feedback" }),
  );

  expect(await screen.findByText(/Revision queued/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalledWith(
    "/api/jobs/job1/generate",
    expect.anything(),
  );
});

it("requires deletion confirmation and removes jobs only after API success", async () => {
  let removed = false;
  const original = vi.mocked(fetch).getMockImplementation()!;

  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/jobs/job1" && init?.method === "DELETE") {
      removed = true;

      return Response.json({ deleted: true, cleanupPending: false });
    }

    if (String(url) === "/api/jobs" && removed) return Response.json([]);

    return original(url, init);
  });

  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Acme React Developer/ }),
  );

  await userEvent.click(
    await screen.findByRole("button", { name: "Delete job" }),
  );

  expect(removed).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel deletion" }),
  );

  expect(removed).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Delete job" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Delete permanently" }),
  );

  expect(await screen.findByText("Job and CVs deleted.")).toBeInTheDocument();

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(removed).toBe(true);
});
