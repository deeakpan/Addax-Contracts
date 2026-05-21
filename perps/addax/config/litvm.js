/**
 * LitVM LiteForge (chainId 4441) — DIA oracle + Addax token addresses.
 * @see https://www.diadata.org/docs/guides/chain-specific-guide/litvm
 */
module.exports = {
  chainId: 4441,
  rpcHttp: "https://liteforge.rpc.caldera.xyz/http",

  /** DIAOracleV2 on LitVM Testnet */
  diaOracle: "0xE7F65d4bAdcfABc4eA57B8F66bBa044363D89eec",

  /** LitVM heartbeat = 1h — stale window matches heartbeat */
  diaHeartbeatSeconds: 3600,
  maxPriceAgeSeconds: 3600,

  /** DIA `getValue` fixed-comma decimals (standard DIAOracleV2) */
  diaPriceDecimals: 8,

  /** Chainlink-style adapters (18 decimals) — optional; primary path uses diaOracle + keys */
  adapters: {
    LTC: "0x45dDa5d881BD2C917976CCfde74fFd6f6412da29",
    USDC: "0x4f91a950ed73c8B6F28dFE460f9444ed8866894f",
    USDT: "0xd7ff0A3DdE1FdC2137Ff4CaAde5396f009739645",
    ETH: "0xc760B46beF9eD3F9A3d2b825164324D6703F0185",
    BTC: "0x7d0445782E383223c7B4B660bb96b87213e9b605",
  },

  /** DIA pair keys for VaultPriceFeedDia.getValue */
  diaKeys: {
    LTC: "LTC/USD",
    USDC: "USDC/USD",
    USDT: "USDT/USD",
    ETH: "ETH/USD",
    BTC: "BTC/USD",
  },

  tokens: {
    wzkLTC: "0x6eF676c26E8C977554DA186eD0B215956E8F8753",
    aUSDC: "0x72F4efAC9133d28fa05aEbc9edCd8fC3dE14BB50",
    /** FnUSD — short collateral (DIA priced via USDC/USD) */
    fnUSD: "0x219F2AC287458cD58aB46ABd3cfbe451728323f4",
  },
};
