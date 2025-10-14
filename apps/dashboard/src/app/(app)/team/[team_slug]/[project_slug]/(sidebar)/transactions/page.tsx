import { createVaultClient, listEoas } from "@thirdweb-dev/vault-sdk";
import { ArrowLeftRightIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getAuthToken } from "@/api/auth-token";
import { getProject } from "@/api/project/projects";
import { ProjectPage } from "@/components/blocks/project-page/project-page";
import { NEXT_PUBLIC_THIRDWEB_VAULT_URL } from "@/constants/public-envs";
import { getClientThirdwebClient } from "@/constants/thirdweb-client.client";
import { TransactionsAnalyticsPageContent } from "./analytics/analytics-page";
import { EngineChecklist } from "./analytics/ftux.client";
import { SolanaTransactionsTable } from "./analytics/solana-tx-table/solana-tx-table";
import { TransactionAnalyticsSummary } from "./analytics/summary";
import { getTransactionAnalyticsSummary } from "./lib/analytics";
import type { Wallet } from "./server-wallets/wallet-table/types";
import { ServerWalletsTable } from "./server-wallets/wallet-table/wallet-table";
import { listSolanaAccounts } from "./solana-wallets/lib/vault.client";
import type { SolanaWallet } from "./solana-wallets/wallet-table/types";
import { SolanaWalletsTable } from "./solana-wallets/wallet-table/wallet-table";

export default async function TransactionsAnalyticsPage(props: {
  params: Promise<{ team_slug: string; project_slug: string }>;
  searchParams: Promise<{
    from?: string | string[] | undefined;
    to?: string | string[] | undefined;
    interval?: string | string[] | undefined;
    testTxWithWallet?: string | string[] | undefined;
    page?: string;
    solana_page?: string;
  }>;
}) {
  const [params, searchParams, authToken] = await Promise.all([
    props.params,
    props.searchParams,
    getAuthToken(),
  ]);

  if (!authToken) {
    notFound();
  }

  const [vaultClient, project] = await Promise.all([
    createVaultClient({
      baseUrl: NEXT_PUBLIC_THIRDWEB_VAULT_URL,
    }).catch(() => undefined),
    getProject(params.team_slug, params.project_slug),
  ]);

  if (!project) {
    redirect(`/team/${params.team_slug}`);
  }

  if (!vaultClient) {
    return <div>Error: Failed to connect to Vault</div>;
  }

  const projectEngineCloudService = project.services.find(
    (service) => service.name === "engineCloud",
  );

  const managementAccessToken =
    projectEngineCloudService?.managementAccessToken;
  const isManagedVault = !!projectEngineCloudService?.encryptedAdminKey;

  const pageSize = 10;
  const currentPage = Number.parseInt(searchParams.page ?? "1");
  const solanCurrentPage = Number.parseInt(searchParams.solana_page ?? "1");

  const eoas = managementAccessToken
    ? await listEoas({
        client: vaultClient,
        request: {
          auth: {
            accessToken: managementAccessToken,
          },
          options: {
            page: currentPage - 1,
            // @ts-expect-error - TODO: fix this
            page_size: pageSize,
          },
        },
      })
    : { data: { items: [], totalRecords: 0 }, error: null, success: true };

  const wallets = eoas.data?.items as Wallet[] | undefined;

  // Fetch Solana accounts
  const solanaAccounts = managementAccessToken
    ? await listSolanaAccounts({
        managementAccessToken,
        page: solanCurrentPage,
        limit: pageSize,
        projectId: project.id,
      })
    : { data: { items: [], totalRecords: 0 }, error: null, success: true };

  const solanaWallets = solanaAccounts.data?.items;

  const initialData = await getTransactionAnalyticsSummary({
    clientId: project.publishableKey,
    teamId: project.teamId,
  }).catch(() => undefined);
  const hasTransactions = initialData ? initialData.totalCount > 0 : false;

  const client = getClientThirdwebClient({
    jwt: authToken,
    teamId: project.teamId,
  });

  return (
    <ProjectPage
      header={{
        client,
        icon: ArrowLeftRightIcon,
        title: "Transactions",
        description: (
          <>
            Send, monitor, and manage transactions.{" "}
            <br className="max-sm:hidden" /> Send transactions from user or
            server wallets, sponsor gas, monitor transaction status, and more
          </>
        ),
        actions: null,
        links: [
          {
            type: "docs",
            href: "https://portal.thirdweb.com/transactions",
          },
          {
            type: "playground",
            href: "https://playground.thirdweb.com/transactions/airdrop-tokens",
          },
          {
            type: "api",
            href: "https://api.thirdweb.com/reference#tag/transactions",
          },
        ],
      }}
    >
      <div className="flex flex-col gap-10">
        <EngineChecklist
          isManagedVault={isManagedVault}
          client={client}
          hasTransactions={hasTransactions}
          managementAccessToken={managementAccessToken ?? undefined}
          project={project}
          teamSlug={params.team_slug}
          testTxWithWallet={searchParams.testTxWithWallet as string | undefined}
          wallets={wallets ?? []}
        />
        {hasTransactions && !searchParams.testTxWithWallet && (
          <TransactionAnalyticsSummary
            clientId={project.publishableKey}
            initialData={initialData}
            teamId={project.teamId}
          />
        )}

        {/* transactions */}
        <TransactionsAnalyticsPageContent
          client={client}
          project={project}
          searchParams={searchParams}
          showAnalytics={hasTransactions && !searchParams.testTxWithWallet}
          teamSlug={params.team_slug}
          wallets={wallets}
        />

        {/* server wallets */}
        {eoas.error ? (
          <div>Error: {eoas.error.message}</div>
        ) : (
          <ServerWalletsTable
            client={client}
            currentPage={currentPage}
            managementAccessToken={managementAccessToken ?? undefined}
            project={project}
            teamSlug={params.team_slug}
            totalPages={Math.ceil(eoas.data.totalRecords / pageSize)}
            totalRecords={eoas.data.totalRecords}
            wallets={eoas.data.items as Wallet[]}
          />
        )}

        {/* Solana transactions */}
        <SolanaTransactionsTable
          client={client}
          project={project}
          teamSlug={params.team_slug}
          wallets={solanaWallets ?? []}
        />

        {/* Solana server wallets */}
        {solanaAccounts.error ? (
          <div>Error: {solanaAccounts.error.message}</div>
        ) : (
          <SolanaWalletsTable
            client={client}
            currentPage={solanCurrentPage}
            managementAccessToken={managementAccessToken ?? undefined}
            project={project}
            teamSlug={params.team_slug}
            totalPages={Math.ceil(solanaAccounts.data.totalRecords / pageSize)}
            totalRecords={solanaAccounts.data.totalRecords}
            wallets={solanaAccounts.data.items}
          />
        )}
      </div>
    </ProjectPage>
  );
}
