import { Client, GatewayIntentBits, REST, Routes } from "discord.js";
import express from "express";
import { commands } from "./commands.js";
import {
  ensureSettings,
  updateSettings,
  getUser,
  setBalance,
  setDaily,
  topUsers,
  getHistory,
  getStats,
  addHistory,
  resetUser,
  resetGuild
} from "./db.js";

// ====== IDs anh đưa ======
const CLIENT_ID = "1478077058512060561";
const GUILD_ID  = "1279852470306082817";
const DEFAULT_GAME_CHANNEL_ID = "1477815093143011512";

// ====== ENV bắt buộc ======
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ Missing DISCORD_TOKEN env var.");
  process.exit(1);
}

// ====== Web server để Render health check ======
const app = express();
app.get("/", (_req, res) => res.status(200).send("OK"));
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`🌐 Health server on ${port}`));

// ====== Discord client ======
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ====== Helpers ======
function roll3d6() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  const d3 = 1 + Math.floor(Math.random() * 6);
  return { d1, d2, d3, sum: d1 + d2 + d3 };
}

function resultTaiXiu(sum) {
  // Luật phổ biến: 3 hoặc 18 = nhà cái ăn (thua hết)
  if (sum === 3 || sum === 18) return "nha_cai_an";
  if (sum >= 11 && sum <= 17) return "tai";
  return "xiu"; // 4-10
}

function requireGameChannel(interaction, settings) {
  // Cho /balance /help /stats /history /leaderboard dùng ở đâu cũng được
  const free = new Set(["balance", "help", "stats", "history", "leaderboard"]);
  if (free.has(interaction.commandName)) return false;
  return interaction.channelId !== settings.game_channel_id;
}

async function registerGuildCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Slash commands registered (GUILD).");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    await registerGuildCommands();
  } catch (e) {
    console.error("❌ Register commands error:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Only handle the configured guild (đỡ lo bot bị add nơi khác)
  if (interaction.guildId !== GUILD_ID) {
    await interaction.reply({ content: "Bot này chỉ cấu hình cho server chính.", ephemeral: true });
    return;
  }

  const settings = ensureSettings(GUILD_ID, {
    game_channel_id: DEFAULT_GAME_CHANNEL_ID,
    min_bet: 1,
    max_bet: 1000000,
    start_money: 2000,
    daily_money: 1500,
    daily_cooldown_ms: 24 * 60 * 60 * 1000
  });

  try {
    if (requireGameChannel(interaction, settings)) {
      await interaction.reply({
        content: `⚠️ Chỉ được dùng lệnh game ở kênh <#${settings.game_channel_id}>.`,
        ephemeral: true
      });
      return;
    }

    const uid = interaction.user.id;

    // ===== HELP =====
    if (interaction.commandName === "help") {
      await interaction.reply(
        [
          "📌 **Lệnh cơ bản**",
          "`/start` tạo tài khoản + vốn",
          "`/balance` xem số dư",
          "`/daily` nhận tiền theo giờ",
          "`/taixiu chon:<tai/xiu> tien:<...>` cược",
          "`/leaderboard` top 10",
          "`/history so_luong:<1-20>` lịch sử cược",
          "`/stats` thống kê",
          "",
          "🛠️ **Admin**",
          "`/setchannel channel_id:<...>` đặt kênh chơi",
          "`/setconfig ...` chỉnh min/max/start/daily/cooldown",
          "`/give user amount` cộng tiền",
          "`/take user amount` trừ tiền",
          "`/resetuser user` reset 1 người",
          "`/resetall` reset toàn bộ"
        ].join("\n")
      );
      return;
    }

    // ===== USER =====
    if (interaction.commandName === "start") {
      const user = getUser(GUILD_ID, uid);
      if (user.balance > 0) {
        await interaction.reply({ content: `Anh đã có tài khoản rồi 😼 Số dư: **${user.balance}**`, ephemeral: true });
        return;
      }
      setBalance(GUILD_ID, uid, settings.start_money);
      await interaction.reply(`✅ Tạo tài khoản xong! Vốn ban đầu: **${settings.start_money}**`);
      return;
    }

    if (interaction.commandName === "balance") {
      const user = getUser(GUILD_ID, uid);
      await interaction.reply({ content: `💰 Số dư của anh: **${user.balance}**`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "daily") {
      const user = getUser(GUILD_ID, uid);
      const now = Date.now();
      const left = user.last_daily + settings.daily_cooldown_ms - now;

      if (left > 0) {
        const hours = Math.ceil(left / (60 * 60 * 1000));
        await interaction.reply({ content: `⏳ Anh đã nhận daily rồi. Quay lại sau khoảng **${hours}h** nha.`, ephemeral: true });
        return;
      }

      setDaily(GUILD_ID, uid, now);
      setBalance(GUILD_ID, uid, user.balance + settings.daily_money);

      await interaction.reply(`🎁 Daily: +**${settings.daily_money}**\n💰 Số dư mới: **${user.balance + settings.daily_money}**`);
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const top = topUsers(GUILD_ID, 10);
      if (!top.length) {
        await interaction.reply("Chưa có dữ liệu leaderboard.");
        return;
      }
      const lines = top.map((x, i) => `**${i + 1}.** <@${x.user_id}> — **${x.balance}**`);
      await interaction.reply(`🏆 **TOP 10**\n${lines.join("\n")}`);
      return;
    }

    if (interaction.commandName === "history") {
      const n = interaction.options.getInteger("so_luong") ?? 10;
      const rows = getHistory(GUILD_ID, uid, n);
      if (!rows.length) {
        await interaction.reply({ content: "Chưa có lịch sử cược.", ephemeral: true });
        return;
      }
      const lines = rows.map((r) => {
        const pick = r.choice === "tai" ? "TÀI" : "XỈU";
        const out =
          r.outcome === "nha_cai_an" ? "NHÀ CÁI ĂN" : (r.outcome === "tai" ? "TÀI" : "XỈU");
        const sign = r.delta > 0 ? "+" : "";
        return `• **${pick}** cược **${r.bet}** | 🎲 ${r.d1}-${r.d2}-${r.d3} (=${r.sum}) | Ra **${out}** | ${sign}**${r.delta}** | Số dư **${r.balance_after}**`;
      });
      await interaction.reply({ content: `🧾 **Lịch sử (${rows.length})**\n${lines.join("\n")}`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "stats") {
      const s = getStats(GUILD_ID, uid);
      await interaction.reply({
        content: `📊 **Thống kê của anh**\n• Tổng ván: **${s.total}**\n• Thắng: **${s.win}** | Thua: **${s.lose}**\n• Lãi/Lỗ ròng: **${s.net}**`,
        ephemeral: true
      });
      return;
    }

    if (interaction.commandName === "taixiu") {
      const user = getUser(GUILD_ID, uid);
      const choice = interaction.options.getString("chon", true);
      const bet = interaction.options.getInteger("tien", true);

      if (user.balance <= 0) {
        await interaction.reply({ content: `Anh chưa có tiền 😿 dùng /start hoặc /daily trước nha.`, ephemeral: true });
        return;
      }
      if (bet < settings.min_bet) {
        await interaction.reply({ content: `Cược tối thiểu là **${settings.min_bet}**.`, ephemeral: true });
        return;
      }
      if (bet > settings.max_bet) {
        await interaction.reply({ content: `Cược tối đa là **${settings.max_bet}**.`, ephemeral: true });
        return;
      }
      if (bet > user.balance) {
        await interaction.reply({ content: `Anh không đủ tiền. Số dư: **${user.balance}**`, ephemeral: true });
        return;
      }

      const { d1, d2, d3, sum } = roll3d6();
      const outcome = resultTaiXiu(sum);

      let delta = 0;
      let msg = `🎲 Kết quả: **${d1} - ${d2} - ${d3}** (Tổng **${sum}**)\n`;

      if (outcome === "nha_cai_an") {
        delta = -bet;
        msg += `💀 **Cực trị (3 hoặc 18)** — Nhà cái ăn.\n❌ Anh thua **${bet}**.`;
      } else if (outcome === choice) {
        // Win 1:1
        delta = +bet;
        msg += `✅ Ra **${outcome === "tai" ? "TÀI" : "XỈU"}** — Anh thắng **${bet}**!`;
      } else {
        delta = -bet;
        msg += `❌ Ra **${outcome === "tai" ? "TÀI" : "XỈU"}** — Anh thua **${bet}**.`;
      }

      const newBal = user.balance + delta;
      setBalance(GUILD_ID, uid, newBal);

      addHistory({
        guild_id: GUILD_ID,
        user_id: uid,
        choice,
        bet,
        d1, d2, d3,
        sum,
        outcome,
        delta,
        balance_after: newBal,
        created_at: Date.now()
      });

      msg += `\n💰 Số dư: **${newBal}**`;
      await interaction.reply(msg);
      return;
    }

    // ===== ADMIN =====
    if (interaction.commandName === "setchannel") {
      const ch = interaction.options.getString("channel_id", true).trim();
      const next = updateSettings(GUILD_ID, { game_channel_id: ch });
      await interaction.reply(`✅ Đã set kênh chơi thành <#${next.game_channel_id}>`);
      return;
    }

    if (interaction.commandName === "setconfig") {
      const patch = {};
      const minBet = interaction.options.getInteger("min_bet");
      const maxBet = interaction.options.getInteger("max_bet");
      const startMoney = interaction.options.getInteger("start_money");
      const dailyMoney = interaction.options.getInteger("daily_money");
      const dailyHours = interaction.options.getInteger("daily_hours");

      if (minBet !== null) patch.min_bet = minBet;
      if (maxBet !== null) patch.max_bet = maxBet;
      if (startMoney !== null) patch.start_money = startMoney;
      if (dailyMoney !== null) patch.daily_money = dailyMoney;
      if (dailyHours !== null) patch.daily_cooldown_ms = dailyHours * 60 * 60 * 1000;

      const next = updateSettings(GUILD_ID, patch);
      await interaction.reply(
        `✅ Cập nhật luật:\n• min_bet: **${next.min_bet}**\n• max_bet: **${next.max_bet}**\n• start_money: **${next.start_money}**\n• daily_money: **${next.daily_money}**\n• daily_hours: **${Math.round(next.daily_cooldown_ms / 3600000)}**\n• game_channel: <#${next.game_channel_id}>`
      );
      return;
    }

    if (interaction.commandName === "give" || interaction.commandName === "take") {
      const target = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const u = getUser(GUILD_ID, target.id);

      const delta2 = interaction.commandName === "give" ? amount : -amount;
      const nextBal = Math.max(0, u.balance + delta2);
      setBalance(GUILD_ID, target.id, nextBal);

      await interaction.reply(
        `✅ ${interaction.commandName === "give" ? "Cộng" : "Trừ"} **${amount}** cho <@${target.id}>.\n💰 Số dư mới: **${nextBal}**`
      );
      return;
    }

    if (interaction.commandName === "resetuser") {
      const target = interaction.options.getUser("user", true);
      resetUser(GUILD_ID, target.id);
      await interaction.reply(`✅ Đã reset tài khoản + lịch sử của <@${target.id}>`);
      return;
    }

    if (interaction.commandName === "resetall") {
      resetGuild(GUILD_ID);
      await interaction.reply("✅ Đã reset toàn bộ users + lịch sử trong guild (giữ settings).");
      return;
    }

  } catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "❌ Có lỗi xảy ra. Anh check log Render giúp em.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ Có lỗi xảy ra. Anh check log Render giúp em.", ephemeral: true });
    }
  }
});

client.login(TOKEN);
