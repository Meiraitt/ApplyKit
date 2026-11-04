import { describe, it, expect } from "vitest";
import { cvFilename } from "../src/repositories/downloads.repository.js";

describe("public CV filename", () => {
  it("includes candidate, role and company in both formats", () => {
    expect(
      cvFilename("Nome Sobrenome", "Full Stack", "ExampleCo", 1, "pdf"),
    ).toBe("Nome_Sobrenome_Fullstack_ExampleCo.pdf");

    expect(
      cvFilename("Nome Sobrenome", "Full Stack", "ExampleCo", 2, "docx"),
    ).toBe("Nome_Sobrenome_Fullstack_ExampleCo_v2.docx");
  });

  it("normalizes accents and rejects separators and control characters", () => {
    expect(
      cvFilename(
        "João da Silva",
        "Front-end Pleno",
        "../Ação\r\nTeste",
        3,
        "pdf",
      ),
    ).toBe("Joao_da_Silva_Frontend_Pleno_Acao_Teste_v3.pdf");

    expect(cvFilename("", "", "", 1, "pdf")).toBe("Candidate_Job_Company.pdf");
    expect(
      cvFilename("a".repeat(500), "b".repeat(500), "c".repeat(500), 123, "docx")
        .length,
    ).toBeLessThan(220);
  });
});
