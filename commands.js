// NOTE:
// - Các lệnh admin có default_member_permissions = "8" (Administrator)
// - Lệnh game dùng cho mọi người

export const commands = [
  { name: "help", description: "Xem hướng dẫn lệnh" },

  { name: "start", description: "Tạo tài khoản và nhận vốn ban đầu" },
  { name: "balance", description: "Xem số dư" },
  { name: "daily", description: "Nhận tiền mỗi 24h" },

  {
    name: "taixiu",
    description: "Cược tài/xỉu (3 xúc xắc)",
    options: [
      {
        name: "chon",
        description: "Chọn tài hoặc xỉu",
        type: 3,
        required: true,
        choices: [
          { name: "Tài", value: "tai" },
          { name: "Xỉu", value: "xiu" }
        ]
      },
      {
        name: "tien",
        description: "Số tiền cược",
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },

  { name: "leaderboard", description: "Bảng xếp hạng top giàu" },
  {
    name: "history",
    description: "Xem lịch sử cược gần đây",
    options: [
      {
        name: "so_luong",
        description: "Số dòng (1-20)",
        type: 4,
        required: false,
        min_value: 1,
        max_value: 20
      }
    ]
  },
  { name: "stats", description: "Xem thống kê thắng/thua của anh" },

  // ===== ADMIN =====
  {
    name: "setchannel",
    description: "Admin: đặt kênh chơi tài xỉu",
    default_member_permissions: "8",
    options: [
      {
        name: "channel_id",
        description: "ID kênh (ví dụ 1477...)",
        type: 3,
        required: true
      }
    ]
  },
  {
    name: "setconfig",
    description: "Admin: chỉnh luật game",
    default_member_permissions: "8",
    options: [
      { name: "min_bet", description: "Cược tối thiểu", type: 4, required: false, min_value: 1 },
      { name: "max_bet", description: "Cược tối đa", type: 4, required: false, min_value: 1 },
      { name: "start_money", description: "Tiền vốn /start", type: 4, required: false, min_value: 0 },
      { name: "daily_money", description: "Tiền /daily", type: 4, required: false, min_value: 0 },
      { name: "daily_hours", description: "Cooldown daily (giờ)", type: 4, required: false, min_value: 1, max_value: 168 }
    ]
  },
  {
    name: "give",
    description: "Admin: cộng tiền cho user",
    default_member_permissions: "8",
    options: [
      { name: "user", description: "Chọn user", type: 6, required: true },
      { name: "amount", description: "Số tiền", type: 4, required: true, min_value: 1 }
    ]
  },
  {
    name: "take",
    description: "Admin: trừ tiền của user",
    default_member_permissions: "8",
    options: [
      { name: "user", description: "Chọn user", type: 6, required: true },
      { name: "amount", description: "Số tiền", type: 4, required: true, min_value: 1 }
    ]
  },
  {
    name: "resetuser",
    description: "Admin: reset tài khoản của 1 user",
    default_member_permissions: "8",
    options: [{ name: "user", description: "Chọn user", type: 6, required: true }]
  },
  {
    name: "resetall",
    description: "Admin: reset toàn bộ dữ liệu guild (CẨN THẬN)",
    default_member_permissions: "8"
  }
];
