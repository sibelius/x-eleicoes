"use client";

export function DeleteAccount() {
  return (
    <form
      action="/api/account"
      method="post"
      onSubmit={(e) => {
        if (!confirm("Excluir sua conta, sua escolha e sua rede importada? Não dá pra desfazer.")) e.preventDefault();
      }}
    >
      <button className="rounded-full border border-[var(--red)] px-4 py-2 text-sm text-[var(--red)]">
        Excluir minha conta e meus dados
      </button>
    </form>
  );
}
