const ContaBancaria = require("../src/contaBancaria");

const dadosPadrao = () => ({
  id: "001",
  titular: "João Vitor Espindola",
  saldo: 1000,
  limite: 500,
  status: "ativa",
  criadaEm: new Date(),
  atualizadaEm: new Date(),
});

/** @param {Record<string, unknown>} [patch] */
const conta = (patch = {}) => new ContaBancaria({ ...dadosPadrao(), ...patch });

describe("ContaBancaria", () => {
  afterEach(() => jest.restoreAllMocks());

  describe("consultas", () => {
    test.each([
      ["obterSaldo", { saldo: 250 }, 250],
      ["obterTitular", { titular: "Maria" }, "Maria"],
      ["obterStatus", { status: "bloqueada" }, "bloqueada"],
      ["obterLimite", { limite: 200 }, 200],
    ])("%s retorna o valor da conta", (metodo, patch, esperado) => {
      expect(conta(patch)[metodo]()).toBe(esperado);
    });

    test.each([
      ["ativa", true],
      ["encerrada", false],
    ])("estaAtiva quando status é %s → %s", (status, esperado) => {
      expect(conta({ status }).estaAtiva()).toBe(esperado);
    });

    test("calcularSaldoDisponivel e gerarResumo", () => {
      const c = conta({ titular: "Ana", saldo: 100, limite: 50 });
      expect(c.calcularSaldoDisponivel()).toBe(150);
      expect(c.gerarResumo()).toStrictEqual({
        titular: "Ana",
        saldo: 100,
        limite: 50,
        disponivel: 150,
        status: "ativa",
      });
    });

    test.each([
      [-1, true],
      [0, false],
      [1, false],
    ])("saldoNegativo com saldo %s → %s", (saldo, negativo) => {
      expect(conta({ saldo }).saldoNegativo()).toBe(negativo);
    });
  });

  describe("depósito e saque", () => {
    test("depositar: rejeita valor <= 0; credita e atualiza data se válido", () => {
      const fixo = new Date("2020-01-01");
      const c = conta({ saldo: 100, atualizadaEm: fixo });
      expect(c.depositar(0)).toBe(false);
      expect(c.depositar(-5)).toBe(false);
      expect(c.obterSaldo()).toBe(100);

      expect(c.depositar(50)).toBe(true);
      expect(c.obterSaldo()).toBe(150);
      expect(c.conta.atualizadaEm.getTime()).toBeGreaterThan(fixo.getTime());
    });

    test("sacar: rejeita valor inválido, insuficiente ou debita até saldo+limite", () => {
      const fixo = new Date("2020-01-01");
      const c = conta({ saldo: 100, limite: 50, atualizadaEm: fixo });
      expect(c.sacar(0)).toBe(false);
      expect(c.sacar(-1)).toBe(false);
      expect(c.sacar(151)).toBe(false);

      expect(c.sacar(150)).toBe(true);
      expect(c.obterSaldo()).toBe(-50);
      expect(c.conta.atualizadaEm.getTime()).toBeGreaterThan(fixo.getTime());
    });

    test("podeSacar cobre limite e valor inválido", () => {
      const c = conta({ saldo: 10, limite: 5 });
      expect(c.podeSacar(0)).toBe(false);
      expect(c.podeSacar(-1)).toBe(false);
      expect(c.podeSacar(16)).toBe(false);
      expect(c.podeSacar(15)).toBe(true);
    });
  });

  describe("titular e status", () => {
    test("alterarTitular", () => {
      expect(conta().alterarTitular("")).toBe(false);
      expect(conta().alterarTitular(null)).toBe(false);
      const c = conta({ titular: "A" });
      expect(c.alterarTitular("B")).toBe(true);
      expect(c.obterTitular()).toBe("B");
    });

    test.each([
      ["bloquearConta", "bloqueada", "bloqueada", "ativa"],
      ["ativarConta", "ativa", "ativa", "bloqueada"],
    ])(
      "%s: já no estado final → false; senão altera",
      (metodo, estadoFinal, jaEra, inicial) => {
        expect(conta({ status: jaEra })[metodo]()).toBe(false);
        const c = conta({ status: inicial });
        expect(c[metodo]()).toBe(true);
        expect(c.obterStatus()).toBe(estadoFinal);
      },
    );

    test("encerrarConta só com saldo zero", () => {
      expect(conta({ saldo: 1 }).encerrarConta()).toBe(false);
      const c = conta({ saldo: 0 });
      expect(c.encerrarConta()).toBe(true);
      expect(c.obterStatus()).toBe("encerrada");
    });
  });

  describe("tarifa, limite e reset", () => {
    test("aplicarTarifa", () => {
      const c = conta({ saldo: 100 });
      expect(c.aplicarTarifa(0)).toBe(false);
      expect(c.aplicarTarifa(-1)).toBe(false);
      expect(c.aplicarTarifa(25)).toBe(true);
      expect(c.obterSaldo()).toBe(75);
    });

    test("ajustarLimite", () => {
      const c = conta({ limite: 100 });
      expect(c.ajustarLimite(-1)).toBe(false);
      expect(c.ajustarLimite(0)).toBe(true);
      expect(c.obterLimite()).toBe(0);
      expect(c.ajustarLimite(300)).toBe(true);
      expect(c.obterLimite()).toBe(300);
    });

    test("resetarConta", () => {
      const antes = new Date("2019-06-01");
      const c = conta({
        saldo: 500,
        limite: 200,
        status: "bloqueada",
        atualizadaEm: antes,
      });
      c.resetarConta();
      expect(c.obterSaldo()).toBe(0);
      expect(c.obterLimite()).toBe(0);
      expect(c.obterStatus()).toBe("ativa");
      expect(c.conta.atualizadaEm.getTime()).toBeGreaterThan(antes.getTime());
    });
  });

  describe("validarConta", () => {
    test.each([
      ["id ausente", { id: undefined }],
      ["titular vazio", { titular: "" }],
      ["saldo não numérico", { saldo: "100" }],
      ["limite negativo", { limite: -1 }],
      ["status inválido", { status: "suspensa" }],
    ])("rejeita: %s", (_, patch) => {
      expect(conta(patch).validarConta()).toBe(false);
    });

    test("aceita conta válida", () => {
      expect(conta().validarConta()).toBe(true);
    });
  });

  describe("transferir", () => {
    test("falha sem saldo ou quando sacar retorna false", () => {
      const origem = conta({ saldo: 10, limite: 0 });
      const destino = conta({ id: "002", saldo: 0, limite: 0 });
      expect(origem.transferir(20, destino)).toBe(false);

      const o2 = conta({ saldo: 100, limite: 0 });
      const d2 = conta({ id: "002", saldo: 0, limite: 0 });
      jest.spyOn(o2, "sacar").mockReturnValueOnce(false);
      expect(o2.transferir(50, d2)).toBe(false);
      expect(d2.obterSaldo()).toBe(0);
    });

    test("transfere valor entre contas", () => {
      const origem = conta({ saldo: 100, limite: 0 });
      const destino = conta({
        id: "002",
        titular: "Destino",
        saldo: 0,
        limite: 0,
      });
      expect(origem.transferir(40, destino)).toBe(true);
      expect(origem.obterSaldo()).toBe(60);
      expect(destino.obterSaldo()).toBe(40);
    });
  });
});
