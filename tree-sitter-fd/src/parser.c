#include "tree_sitter/parser.h"

#if defined(__GNUC__) || defined(__clang__)
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#endif

#ifdef _MSC_VER
#pragma optimize("", off)
#elif defined(__clang__)
#pragma clang optimize off
#elif defined(__GNUC__)
#pragma GCC optimize ("O0")
#endif

#define LANGUAGE_VERSION 14
#define STATE_COUNT 94
#define LARGE_STATE_COUNT 18
#define SYMBOL_COUNT 67
#define ALIAS_COUNT 0
#define TOKEN_COUNT 46
#define EXTERNAL_TOKEN_COUNT 0
#define FIELD_COUNT 9
#define MAX_ALIAS_SEQUENCE_LENGTH 6
#define PRODUCTION_ID_COUNT 10

enum ts_symbol_identifiers {
  sym_comment = 1,
  anon_sym_POUND_POUND = 2,
  anon_sym_COLON = 3,
  sym_annotation_text = 4,
  anon_sym_accept = 5,
  anon_sym_status = 6,
  anon_sym_priority = 7,
  anon_sym_tag = 8,
  anon_sym_style = 9,
  anon_sym_LBRACE = 10,
  anon_sym_RBRACE = 11,
  anon_sym_group = 12,
  anon_sym_rect = 13,
  anon_sym_ellipse = 14,
  anon_sym_path = 15,
  anon_sym_text = 16,
  anon_sym_w = 17,
  anon_sym_h = 18,
  anon_sym_width = 19,
  anon_sym_height = 20,
  anon_sym_fill = 21,
  anon_sym_stroke = 22,
  anon_sym_corner = 23,
  anon_sym_opacity = 24,
  anon_sym_font = 25,
  anon_sym_bg = 26,
  anon_sym_use = 27,
  anon_sym_layout = 28,
  anon_sym_shadow = 29,
  anon_sym_scale = 30,
  anon_sym_rotate = 31,
  anon_sym_translate = 32,
  anon_sym_center_in = 33,
  anon_sym_offset = 34,
  anon_sym_ease = 35,
  anon_sym_duration = 36,
  anon_sym_EQ = 37,
  anon_sym_anim = 38,
  anon_sym_DASH_GT = 39,
  anon_sym_AT = 40,
  sym_identifier = 41,
  sym_number = 42,
  sym_hex_color = 43,
  anon_sym_DQUOTE = 44,
  aux_sym_string_token1 = 45,
  sym_document = 46,
  sym_annotation = 47,
  sym_annotation_typed = 48,
  sym_annotation_keyword = 49,
  sym_style_block = 50,
  sym_node_declaration = 51,
  sym_node_kind = 52,
  sym_node_body_item = 53,
  sym_property = 54,
  sym_property_name = 55,
  sym__value_item = 56,
  sym_key_value_pair = 57,
  sym_anim_block = 58,
  sym_anim_trigger = 59,
  sym_constraint_line = 60,
  sym_node_id = 61,
  sym_string = 62,
  aux_sym_document_repeat1 = 63,
  aux_sym_style_block_repeat1 = 64,
  aux_sym_node_declaration_repeat1 = 65,
  aux_sym_property_repeat1 = 66,
};

static const char * const ts_symbol_names[] = {
  [ts_builtin_sym_end] = "end",
  [sym_comment] = "comment",
  [anon_sym_POUND_POUND] = "##",
  [anon_sym_COLON] = ":",
  [sym_annotation_text] = "annotation_text",
  [anon_sym_accept] = "accept",
  [anon_sym_status] = "status",
  [anon_sym_priority] = "priority",
  [anon_sym_tag] = "tag",
  [anon_sym_style] = "style",
  [anon_sym_LBRACE] = "{",
  [anon_sym_RBRACE] = "}",
  [anon_sym_group] = "group",
  [anon_sym_rect] = "rect",
  [anon_sym_ellipse] = "ellipse",
  [anon_sym_path] = "path",
  [anon_sym_text] = "text",
  [anon_sym_w] = "w",
  [anon_sym_h] = "h",
  [anon_sym_width] = "width",
  [anon_sym_height] = "height",
  [anon_sym_fill] = "fill",
  [anon_sym_stroke] = "stroke",
  [anon_sym_corner] = "corner",
  [anon_sym_opacity] = "opacity",
  [anon_sym_font] = "font",
  [anon_sym_bg] = "bg",
  [anon_sym_use] = "use",
  [anon_sym_layout] = "layout",
  [anon_sym_shadow] = "shadow",
  [anon_sym_scale] = "scale",
  [anon_sym_rotate] = "rotate",
  [anon_sym_translate] = "translate",
  [anon_sym_center_in] = "center_in",
  [anon_sym_offset] = "offset",
  [anon_sym_ease] = "ease",
  [anon_sym_duration] = "duration",
  [anon_sym_EQ] = "=",
  [anon_sym_anim] = "anim",
  [anon_sym_DASH_GT] = "->",
  [anon_sym_AT] = "@",
  [sym_identifier] = "identifier",
  [sym_number] = "number",
  [sym_hex_color] = "hex_color",
  [anon_sym_DQUOTE] = "\"",
  [aux_sym_string_token1] = "string_token1",
  [sym_document] = "document",
  [sym_annotation] = "annotation",
  [sym_annotation_typed] = "annotation_typed",
  [sym_annotation_keyword] = "annotation_keyword",
  [sym_style_block] = "style_block",
  [sym_node_declaration] = "node_declaration",
  [sym_node_kind] = "node_kind",
  [sym_node_body_item] = "node_body_item",
  [sym_property] = "property",
  [sym_property_name] = "property_name",
  [sym__value_item] = "_value_item",
  [sym_key_value_pair] = "key_value_pair",
  [sym_anim_block] = "anim_block",
  [sym_anim_trigger] = "anim_trigger",
  [sym_constraint_line] = "constraint_line",
  [sym_node_id] = "node_id",
  [sym_string] = "string",
  [aux_sym_document_repeat1] = "document_repeat1",
  [aux_sym_style_block_repeat1] = "style_block_repeat1",
  [aux_sym_node_declaration_repeat1] = "node_declaration_repeat1",
  [aux_sym_property_repeat1] = "property_repeat1",
};

static const TSSymbol ts_symbol_map[] = {
  [ts_builtin_sym_end] = ts_builtin_sym_end,
  [sym_comment] = sym_comment,
  [anon_sym_POUND_POUND] = anon_sym_POUND_POUND,
  [anon_sym_COLON] = anon_sym_COLON,
  [sym_annotation_text] = sym_annotation_text,
  [anon_sym_accept] = anon_sym_accept,
  [anon_sym_status] = anon_sym_status,
  [anon_sym_priority] = anon_sym_priority,
  [anon_sym_tag] = anon_sym_tag,
  [anon_sym_style] = anon_sym_style,
  [anon_sym_LBRACE] = anon_sym_LBRACE,
  [anon_sym_RBRACE] = anon_sym_RBRACE,
  [anon_sym_group] = anon_sym_group,
  [anon_sym_rect] = anon_sym_rect,
  [anon_sym_ellipse] = anon_sym_ellipse,
  [anon_sym_path] = anon_sym_path,
  [anon_sym_text] = anon_sym_text,
  [anon_sym_w] = anon_sym_w,
  [anon_sym_h] = anon_sym_h,
  [anon_sym_width] = anon_sym_width,
  [anon_sym_height] = anon_sym_height,
  [anon_sym_fill] = anon_sym_fill,
  [anon_sym_stroke] = anon_sym_stroke,
  [anon_sym_corner] = anon_sym_corner,
  [anon_sym_opacity] = anon_sym_opacity,
  [anon_sym_font] = anon_sym_font,
  [anon_sym_bg] = anon_sym_bg,
  [anon_sym_use] = anon_sym_use,
  [anon_sym_layout] = anon_sym_layout,
  [anon_sym_shadow] = anon_sym_shadow,
  [anon_sym_scale] = anon_sym_scale,
  [anon_sym_rotate] = anon_sym_rotate,
  [anon_sym_translate] = anon_sym_translate,
  [anon_sym_center_in] = anon_sym_center_in,
  [anon_sym_offset] = anon_sym_offset,
  [anon_sym_ease] = anon_sym_ease,
  [anon_sym_duration] = anon_sym_duration,
  [anon_sym_EQ] = anon_sym_EQ,
  [anon_sym_anim] = anon_sym_anim,
  [anon_sym_DASH_GT] = anon_sym_DASH_GT,
  [anon_sym_AT] = anon_sym_AT,
  [sym_identifier] = sym_identifier,
  [sym_number] = sym_number,
  [sym_hex_color] = sym_hex_color,
  [anon_sym_DQUOTE] = anon_sym_DQUOTE,
  [aux_sym_string_token1] = aux_sym_string_token1,
  [sym_document] = sym_document,
  [sym_annotation] = sym_annotation,
  [sym_annotation_typed] = sym_annotation_typed,
  [sym_annotation_keyword] = sym_annotation_keyword,
  [sym_style_block] = sym_style_block,
  [sym_node_declaration] = sym_node_declaration,
  [sym_node_kind] = sym_node_kind,
  [sym_node_body_item] = sym_node_body_item,
  [sym_property] = sym_property,
  [sym_property_name] = sym_property_name,
  [sym__value_item] = sym__value_item,
  [sym_key_value_pair] = sym_key_value_pair,
  [sym_anim_block] = sym_anim_block,
  [sym_anim_trigger] = sym_anim_trigger,
  [sym_constraint_line] = sym_constraint_line,
  [sym_node_id] = sym_node_id,
  [sym_string] = sym_string,
  [aux_sym_document_repeat1] = aux_sym_document_repeat1,
  [aux_sym_style_block_repeat1] = aux_sym_style_block_repeat1,
  [aux_sym_node_declaration_repeat1] = aux_sym_node_declaration_repeat1,
  [aux_sym_property_repeat1] = aux_sym_property_repeat1,
};

static const TSSymbolMetadata ts_symbol_metadata[] = {
  [ts_builtin_sym_end] = {
    .visible = false,
    .named = true,
  },
  [sym_comment] = {
    .visible = true,
    .named = true,
  },
  [anon_sym_POUND_POUND] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_COLON] = {
    .visible = true,
    .named = false,
  },
  [sym_annotation_text] = {
    .visible = true,
    .named = true,
  },
  [anon_sym_accept] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_status] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_priority] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_tag] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_style] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_LBRACE] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_RBRACE] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_group] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_rect] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_ellipse] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_path] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_text] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_w] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_h] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_width] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_height] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_fill] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_stroke] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_corner] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_opacity] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_font] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_bg] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_use] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_layout] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_shadow] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_scale] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_rotate] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_translate] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_center_in] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_offset] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_ease] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_duration] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_EQ] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_anim] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_DASH_GT] = {
    .visible = true,
    .named = false,
  },
  [anon_sym_AT] = {
    .visible = true,
    .named = false,
  },
  [sym_identifier] = {
    .visible = true,
    .named = true,
  },
  [sym_number] = {
    .visible = true,
    .named = true,
  },
  [sym_hex_color] = {
    .visible = true,
    .named = true,
  },
  [anon_sym_DQUOTE] = {
    .visible = true,
    .named = false,
  },
  [aux_sym_string_token1] = {
    .visible = false,
    .named = false,
  },
  [sym_document] = {
    .visible = true,
    .named = true,
  },
  [sym_annotation] = {
    .visible = true,
    .named = true,
  },
  [sym_annotation_typed] = {
    .visible = true,
    .named = true,
  },
  [sym_annotation_keyword] = {
    .visible = true,
    .named = true,
  },
  [sym_style_block] = {
    .visible = true,
    .named = true,
  },
  [sym_node_declaration] = {
    .visible = true,
    .named = true,
  },
  [sym_node_kind] = {
    .visible = true,
    .named = true,
  },
  [sym_node_body_item] = {
    .visible = true,
    .named = true,
  },
  [sym_property] = {
    .visible = true,
    .named = true,
  },
  [sym_property_name] = {
    .visible = true,
    .named = true,
  },
  [sym__value_item] = {
    .visible = false,
    .named = true,
  },
  [sym_key_value_pair] = {
    .visible = true,
    .named = true,
  },
  [sym_anim_block] = {
    .visible = true,
    .named = true,
  },
  [sym_anim_trigger] = {
    .visible = true,
    .named = true,
  },
  [sym_constraint_line] = {
    .visible = true,
    .named = true,
  },
  [sym_node_id] = {
    .visible = true,
    .named = true,
  },
  [sym_string] = {
    .visible = true,
    .named = true,
  },
  [aux_sym_document_repeat1] = {
    .visible = false,
    .named = false,
  },
  [aux_sym_style_block_repeat1] = {
    .visible = false,
    .named = false,
  },
  [aux_sym_node_declaration_repeat1] = {
    .visible = false,
    .named = false,
  },
  [aux_sym_property_repeat1] = {
    .visible = false,
    .named = false,
  },
};

enum ts_field_identifiers {
  field_constraint_type = 1,
  field_id = 2,
  field_inline_text = 3,
  field_key = 4,
  field_kind = 5,
  field_name = 6,
  field_target = 7,
  field_trigger = 8,
  field_value = 9,
};

static const char * const ts_field_names[] = {
  [0] = NULL,
  [field_constraint_type] = "constraint_type",
  [field_id] = "id",
  [field_inline_text] = "inline_text",
  [field_key] = "key",
  [field_kind] = "kind",
  [field_name] = "name",
  [field_target] = "target",
  [field_trigger] = "trigger",
  [field_value] = "value",
};

static const TSFieldMapSlice ts_field_map_slices[PRODUCTION_ID_COUNT] = {
  [1] = {.index = 0, .length = 1},
  [2] = {.index = 1, .length = 2},
  [3] = {.index = 3, .length = 1},
  [4] = {.index = 4, .length = 2},
  [5] = {.index = 6, .length = 2},
  [6] = {.index = 8, .length = 1},
  [7] = {.index = 9, .length = 3},
  [8] = {.index = 12, .length = 2},
  [9] = {.index = 14, .length = 1},
};

static const TSFieldMapEntry ts_field_map_entries[] = {
  [0] =
    {field_kind, 0},
  [1] =
    {field_key, 0},
    {field_value, 2},
  [3] =
    {field_name, 1},
  [4] =
    {field_id, 1},
    {field_kind, 0},
  [6] =
    {field_inline_text, 1},
    {field_kind, 0},
  [8] =
    {field_name, 0},
  [9] =
    {field_id, 1},
    {field_inline_text, 2},
    {field_kind, 0},
  [12] =
    {field_constraint_type, 2},
    {field_target, 0},
  [14] =
    {field_trigger, 1},
};

static const TSSymbol ts_alias_sequences[PRODUCTION_ID_COUNT][MAX_ALIAS_SEQUENCE_LENGTH] = {
  [0] = {0},
};

static const uint16_t ts_non_terminal_alias_map[] = {
  0,
};

static const TSStateId ts_primary_state_ids[STATE_COUNT] = {
  [0] = 0,
  [1] = 1,
  [2] = 2,
  [3] = 3,
  [4] = 4,
  [5] = 5,
  [6] = 6,
  [7] = 7,
  [8] = 8,
  [9] = 9,
  [10] = 10,
  [11] = 11,
  [12] = 12,
  [13] = 13,
  [14] = 14,
  [15] = 15,
  [16] = 16,
  [17] = 17,
  [18] = 15,
  [19] = 3,
  [20] = 20,
  [21] = 21,
  [22] = 22,
  [23] = 23,
  [24] = 24,
  [25] = 25,
  [26] = 26,
  [27] = 27,
  [28] = 28,
  [29] = 29,
  [30] = 2,
  [31] = 31,
  [32] = 32,
  [33] = 33,
  [34] = 14,
  [35] = 15,
  [36] = 16,
  [37] = 17,
  [38] = 38,
  [39] = 39,
  [40] = 40,
  [41] = 41,
  [42] = 42,
  [43] = 43,
  [44] = 3,
  [45] = 4,
  [46] = 46,
  [47] = 47,
  [48] = 14,
  [49] = 16,
  [50] = 17,
  [51] = 15,
  [52] = 52,
  [53] = 53,
  [54] = 53,
  [55] = 55,
  [56] = 56,
  [57] = 57,
  [58] = 57,
  [59] = 57,
  [60] = 60,
  [61] = 16,
  [62] = 62,
  [63] = 63,
  [64] = 64,
  [65] = 65,
  [66] = 66,
  [67] = 67,
  [68] = 68,
  [69] = 66,
  [70] = 70,
  [71] = 71,
  [72] = 72,
  [73] = 73,
  [74] = 74,
  [75] = 75,
  [76] = 76,
  [77] = 77,
  [78] = 78,
  [79] = 79,
  [80] = 80,
  [81] = 74,
  [82] = 66,
  [83] = 83,
  [84] = 84,
  [85] = 74,
  [86] = 86,
  [87] = 87,
  [88] = 74,
  [89] = 66,
  [90] = 83,
  [91] = 77,
  [92] = 83,
  [93] = 83,
};

static bool ts_lex(TSLexer *lexer, TSStateId state) {
  START_LEXER();
  eof = lexer->eof(lexer);
  switch (state) {
    case 0:
      if (eof) ADVANCE(117);
      ADVANCE_MAP(
        '"', 479,
        '#', 6,
        '-', 10,
        ':', 123,
        '=', 337,
        '@', 342,
        'a', 359,
        'b', 386,
        'c', 367,
        'd', 459,
        'e', 355,
        'f', 393,
        'g', 427,
        'h', 280,
        'l', 345,
        'o', 384,
        'p', 346,
        'r', 379,
        's', 361,
        't', 348,
        'u', 435,
        'w', 277,
        '{', 259,
        '}', 260,
      );
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(0);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('i' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 1:
      if (lookahead == '\n') SKIP(1);
      if (lookahead == '"') ADVANCE(480);
      if (lookahead == '#') ADVANCE(128);
      if (lookahead == 'a') ADVANCE(144);
      if (lookahead == 'b') ADVANCE(169);
      if (lookahead == 'c') ADVANCE(152);
      if (lookahead == 'd') ADVANCE(238);
      if (lookahead == 'e') ADVANCE(141);
      if (lookahead == 'f') ADVANCE(176);
      if (lookahead == 'g') ADVANCE(208);
      if (lookahead == 'h') ADVANCE(282);
      if (lookahead == 'l') ADVANCE(130);
      if (lookahead == 'o') ADVANCE(167);
      if (lookahead == 'p') ADVANCE(131);
      if (lookahead == 'r') ADVANCE(162);
      if (lookahead == 's') ADVANCE(147);
      if (lookahead == 't') ADVANCE(132);
      if (lookahead == 'u') ADVANCE(214);
      if (lookahead == 'w') ADVANCE(279);
      if (lookahead == '}') ADVANCE(261);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(125);
      if (lookahead != 0) ADVANCE(247);
      END_STATE();
    case 2:
      if (lookahead == '\n') SKIP(2);
      if (lookahead == '"') ADVANCE(480);
      if (lookahead == '#') ADVANCE(127);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(126);
      if (lookahead != 0) ADVANCE(247);
      END_STATE();
    case 3:
      ADVANCE_MAP(
        '"', 479,
        '#', 6,
        '-', 110,
        '=', 337,
        '@', 342,
        'a', 410,
        'b', 386,
        'c', 367,
        'd', 459,
        'e', 355,
        'f', 393,
        'g', 427,
        'h', 280,
        'l', 345,
        'o', 384,
        'p', 347,
        'r', 379,
        's', 362,
        't', 368,
        'u', 435,
        'w', 277,
        '}', 260,
      );
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(3);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('i' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 4:
      ADVANCE_MAP(
        '"', 479,
        '#', 112,
        '-', 110,
        '=', 337,
        '@', 342,
        'b', 386,
        'c', 367,
        'd', 459,
        'e', 356,
        'f', 393,
        'h', 280,
        'l', 345,
        'o', 384,
        'r', 420,
        's', 362,
        't', 432,
        'u', 435,
        'w', 277,
        '}', 260,
      );
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(4);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 5:
      if (lookahead == '"') ADVANCE(479);
      if (lookahead == '#') ADVANCE(112);
      if (lookahead == '-') ADVANCE(110);
      if (lookahead == '@') ADVANCE(342);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(5);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 6:
      if (lookahead == '#') ADVANCE(121);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(119);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(120);
      END_STATE();
    case 7:
      if (lookahead == '#') ADVANCE(121);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(120);
      END_STATE();
    case 8:
      if (lookahead == '#') ADVANCE(113);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(8);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 9:
      if (lookahead == '>') ADVANCE(341);
      END_STATE();
    case 10:
      if (lookahead == '>') ADVANCE(341);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      END_STATE();
    case 11:
      if (lookahead == '_') ADVANCE(53);
      END_STATE();
    case 12:
      if (lookahead == 'a') ADVANCE(109);
      END_STATE();
    case 13:
      if (lookahead == 'a') ADVANCE(89);
      END_STATE();
    case 14:
      if (lookahead == 'a') ADVANCE(23);
      END_STATE();
    case 15:
      if (lookahead == 'a') ADVANCE(25);
      END_STATE();
    case 16:
      if (lookahead == 'a') ADVANCE(85);
      if (lookahead == 'l') ADVANCE(57);
      END_STATE();
    case 17:
      if (lookahead == 'a') ADVANCE(68);
      END_STATE();
    case 18:
      if (lookahead == 'a') ADVANCE(59);
      END_STATE();
    case 19:
      if (lookahead == 'a') ADVANCE(99);
      END_STATE();
    case 20:
      if (lookahead == 'a') ADVANCE(100);
      END_STATE();
    case 21:
      if (lookahead == 'a') ADVANCE(102);
      END_STATE();
    case 22:
      if (lookahead == 'c') ADVANCE(18);
      if (lookahead == 'h') ADVANCE(15);
      if (lookahead == 't') ADVANCE(80);
      END_STATE();
    case 23:
      if (lookahead == 'c') ADVANCE(54);
      END_STATE();
    case 24:
      if (lookahead == 'c') ADVANCE(91);
      END_STATE();
    case 25:
      if (lookahead == 'd') ADVANCE(71);
      END_STATE();
    case 26:
      if (lookahead == 'd') ADVANCE(98);
      END_STATE();
    case 27:
      if (lookahead == 'e') ADVANCE(24);
      if (lookahead == 'o') ADVANCE(101);
      END_STATE();
    case 28:
      if (lookahead == 'e') ADVANCE(107);
      if (lookahead == 'r') ADVANCE(17);
      END_STATE();
    case 29:
      if (lookahead == 'e') ADVANCE(307);
      END_STATE();
    case 30:
      if (lookahead == 'e') ADVANCE(331);
      END_STATE();
    case 31:
      if (lookahead == 'e') ADVANCE(316);
      END_STATE();
    case 32:
      if (lookahead == 'e') ADVANCE(256);
      END_STATE();
    case 33:
      if (lookahead == 'e') ADVANCE(319);
      END_STATE();
    case 34:
      if (lookahead == 'e') ADVANCE(292);
      END_STATE();
    case 35:
      if (lookahead == 'e') ADVANCE(268);
      END_STATE();
    case 36:
      if (lookahead == 'e') ADVANCE(322);
      END_STATE();
    case 37:
      if (lookahead == 'e') ADVANCE(66);
      if (lookahead == 'o') ADVANCE(81);
      END_STATE();
    case 38:
      if (lookahead == 'e') ADVANCE(78);
      END_STATE();
    case 39:
      if (lookahead == 'e') ADVANCE(79);
      END_STATE();
    case 40:
      if (lookahead == 'e') ADVANCE(95);
      END_STATE();
    case 41:
      if (lookahead == 'f') ADVANCE(42);
      if (lookahead == 'p') ADVANCE(14);
      END_STATE();
    case 42:
      if (lookahead == 'f') ADVANCE(86);
      END_STATE();
    case 43:
      if (lookahead == 'g') ADVANCE(304);
      END_STATE();
    case 44:
      if (lookahead == 'g') ADVANCE(47);
      END_STATE();
    case 45:
      if (lookahead == 'h') ADVANCE(271);
      END_STATE();
    case 46:
      if (lookahead == 'h') ADVANCE(283);
      END_STATE();
    case 47:
      if (lookahead == 'h') ADVANCE(93);
      END_STATE();
    case 48:
      if (lookahead == 'i') ADVANCE(62);
      END_STATE();
    case 49:
      if (lookahead == 'i') ADVANCE(76);
      END_STATE();
    case 50:
      if (lookahead == 'i') ADVANCE(44);
      END_STATE();
    case 51:
      if (lookahead == 'i') ADVANCE(58);
      if (lookahead == 'o') ADVANCE(67);
      END_STATE();
    case 52:
      if (lookahead == 'i') ADVANCE(74);
      END_STATE();
    case 53:
      if (lookahead == 'i') ADVANCE(65);
      END_STATE();
    case 54:
      if (lookahead == 'i') ADVANCE(96);
      END_STATE();
    case 55:
      if (lookahead == 'k') ADVANCE(34);
      END_STATE();
    case 56:
      if (lookahead == 'l') ADVANCE(289);
      END_STATE();
    case 57:
      if (lookahead == 'l') ADVANCE(49);
      END_STATE();
    case 58:
      if (lookahead == 'l') ADVANCE(56);
      END_STATE();
    case 59:
      if (lookahead == 'l') ADVANCE(31);
      END_STATE();
    case 60:
      if (lookahead == 'l') ADVANCE(32);
      END_STATE();
    case 61:
      if (lookahead == 'l') ADVANCE(21);
      END_STATE();
    case 62:
      if (lookahead == 'm') ADVANCE(338);
      END_STATE();
    case 63:
      if (lookahead == 'n') ADVANCE(48);
      END_STATE();
    case 64:
      if (lookahead == 'n') ADVANCE(334);
      END_STATE();
    case 65:
      if (lookahead == 'n') ADVANCE(325);
      END_STATE();
    case 66:
      if (lookahead == 'n') ADVANCE(97);
      END_STATE();
    case 67:
      if (lookahead == 'n') ADVANCE(90);
      END_STATE();
    case 68:
      if (lookahead == 'n') ADVANCE(87);
      END_STATE();
    case 69:
      if (lookahead == 'n') ADVANCE(39);
      END_STATE();
    case 70:
      if (lookahead == 'o') ADVANCE(55);
      END_STATE();
    case 71:
      if (lookahead == 'o') ADVANCE(106);
      END_STATE();
    case 72:
      if (lookahead == 'o') ADVANCE(103);
      END_STATE();
    case 73:
      if (lookahead == 'o') ADVANCE(105);
      END_STATE();
    case 74:
      if (lookahead == 'o') ADVANCE(64);
      END_STATE();
    case 75:
      if (lookahead == 'p') ADVANCE(262);
      END_STATE();
    case 76:
      if (lookahead == 'p') ADVANCE(88);
      END_STATE();
    case 77:
      if (lookahead == 'r') ADVANCE(72);
      END_STATE();
    case 78:
      if (lookahead == 'r') ADVANCE(11);
      END_STATE();
    case 79:
      if (lookahead == 'r') ADVANCE(295);
      END_STATE();
    case 80:
      if (lookahead == 'r') ADVANCE(70);
      if (lookahead == 'y') ADVANCE(60);
      END_STATE();
    case 81:
      if (lookahead == 'r') ADVANCE(69);
      END_STATE();
    case 82:
      if (lookahead == 'r') ADVANCE(19);
      END_STATE();
    case 83:
      if (lookahead == 's') ADVANCE(470);
      END_STATE();
    case 84:
      if (lookahead == 's') ADVANCE(29);
      END_STATE();
    case 85:
      if (lookahead == 's') ADVANCE(30);
      END_STATE();
    case 86:
      if (lookahead == 's') ADVANCE(40);
      END_STATE();
    case 87:
      if (lookahead == 's') ADVANCE(61);
      END_STATE();
    case 88:
      if (lookahead == 's') ADVANCE(35);
      END_STATE();
    case 89:
      if (lookahead == 't') ADVANCE(45);
      END_STATE();
    case 90:
      if (lookahead == 't') ADVANCE(301);
      END_STATE();
    case 91:
      if (lookahead == 't') ADVANCE(265);
      END_STATE();
    case 92:
      if (lookahead == 't') ADVANCE(274);
      END_STATE();
    case 93:
      if (lookahead == 't') ADVANCE(286);
      END_STATE();
    case 94:
      if (lookahead == 't') ADVANCE(310);
      END_STATE();
    case 95:
      if (lookahead == 't') ADVANCE(328);
      END_STATE();
    case 96:
      if (lookahead == 't') ADVANCE(108);
      END_STATE();
    case 97:
      if (lookahead == 't') ADVANCE(38);
      END_STATE();
    case 98:
      if (lookahead == 't') ADVANCE(46);
      END_STATE();
    case 99:
      if (lookahead == 't') ADVANCE(52);
      END_STATE();
    case 100:
      if (lookahead == 't') ADVANCE(33);
      END_STATE();
    case 101:
      if (lookahead == 't') ADVANCE(20);
      END_STATE();
    case 102:
      if (lookahead == 't') ADVANCE(36);
      END_STATE();
    case 103:
      if (lookahead == 'u') ADVANCE(75);
      END_STATE();
    case 104:
      if (lookahead == 'u') ADVANCE(82);
      END_STATE();
    case 105:
      if (lookahead == 'u') ADVANCE(94);
      END_STATE();
    case 106:
      if (lookahead == 'w') ADVANCE(313);
      END_STATE();
    case 107:
      if (lookahead == 'x') ADVANCE(92);
      END_STATE();
    case 108:
      if (lookahead == 'y') ADVANCE(298);
      END_STATE();
    case 109:
      if (lookahead == 'y') ADVANCE(73);
      END_STATE();
    case 110:
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      END_STATE();
    case 111:
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(472);
      END_STATE();
    case 112:
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(119);
      if (lookahead != 0 &&
          lookahead != '\n' &&
          lookahead != '#') ADVANCE(120);
      END_STATE();
    case 113:
      if (lookahead != 0 &&
          lookahead != '\n' &&
          lookahead != '#') ADVANCE(120);
      END_STATE();
    case 114:
      if (eof) ADVANCE(117);
      if (lookahead == '\n') SKIP(114);
      if (lookahead == '"') ADVANCE(480);
      if (lookahead == '#') ADVANCE(128);
      if (lookahead == '@') ADVANCE(343);
      if (lookahead == 'a') ADVANCE(145);
      if (lookahead == 'e') ADVANCE(185);
      if (lookahead == 'g') ADVANCE(208);
      if (lookahead == 'p') ADVANCE(131);
      if (lookahead == 'r') ADVANCE(163);
      if (lookahead == 's') ADVANCE(228);
      if (lookahead == 't') ADVANCE(133);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(124);
      if (lookahead != 0) ADVANCE(247);
      END_STATE();
    case 115:
      if (eof) ADVANCE(117);
      ADVANCE_MAP(
        '"', 479,
        '#', 6,
        '-', 110,
        '=', 337,
        '@', 342,
        'e', 402,
        'g', 427,
        'p', 347,
        'r', 380,
        's', 453,
        't', 369,
      );
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(115);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      if (('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 116:
      if (eof) ADVANCE(117);
      ADVANCE_MAP(
        '"', 479,
        '#', 7,
        '-', 9,
        ':', 123,
        '@', 342,
        'a', 63,
        'b', 43,
        'c', 37,
        'd', 104,
        'e', 16,
        'f', 51,
        'g', 77,
        'h', 281,
        'l', 12,
        'o', 41,
        'p', 13,
        'r', 27,
        's', 22,
        't', 28,
        'u', 84,
        'w', 278,
        '{', 259,
        '}', 260,
      );
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') SKIP(116);
      END_STATE();
    case 117:
      ACCEPT_TOKEN(ts_builtin_sym_end);
      END_STATE();
    case 118:
      ACCEPT_TOKEN(sym_comment);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(478);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(120);
      END_STATE();
    case 119:
      ACCEPT_TOKEN(sym_comment);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(118);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(120);
      END_STATE();
    case 120:
      ACCEPT_TOKEN(sym_comment);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(120);
      END_STATE();
    case 121:
      ACCEPT_TOKEN(anon_sym_POUND_POUND);
      END_STATE();
    case 122:
      ACCEPT_TOKEN(anon_sym_POUND_POUND);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 123:
      ACCEPT_TOKEN(anon_sym_COLON);
      END_STATE();
    case 124:
      ACCEPT_TOKEN(sym_annotation_text);
      ADVANCE_MAP(
        '"', 480,
        '#', 128,
        '@', 343,
        'a', 145,
        'e', 185,
        'g', 208,
        'p', 131,
        'r', 163,
        's', 228,
        't', 133,
      );
      if (lookahead == '\t' ||
          (0x0b <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(124);
      if (lookahead != 0 &&
          (lookahead < '\t' || '\r' < lookahead)) ADVANCE(247);
      END_STATE();
    case 125:
      ACCEPT_TOKEN(sym_annotation_text);
      ADVANCE_MAP(
        '"', 480,
        '#', 128,
        'a', 144,
        'b', 169,
        'c', 152,
        'd', 238,
        'e', 141,
        'f', 176,
        'g', 208,
        'h', 282,
        'l', 130,
        'o', 167,
        'p', 131,
        'r', 162,
        's', 147,
        't', 132,
        'u', 214,
        'w', 279,
        '}', 261,
      );
      if (lookahead == '\t' ||
          (0x0b <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(125);
      if (lookahead != 0 &&
          (lookahead < '\t' || '\r' < lookahead)) ADVANCE(247);
      END_STATE();
    case 126:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == '"') ADVANCE(480);
      if (lookahead == '#') ADVANCE(127);
      if (lookahead == '\t' ||
          (0x0b <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(126);
      if (lookahead != 0 &&
          (lookahead < '\t' || '\r' < lookahead)) ADVANCE(247);
      END_STATE();
    case 127:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == '#') ADVANCE(247);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 128:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == '#') ADVANCE(122);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 129:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == '_') ADVANCE(180);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 130:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(246);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 131:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(220);
      if (lookahead == 'r') ADVANCE(177);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 132:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(170);
      if (lookahead == 'e') ADVANCE(243);
      if (lookahead == 'r') ADVANCE(136);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 133:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(170);
      if (lookahead == 'e') ADVANCE(243);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 134:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(150);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 135:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(148);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 136:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(195);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 137:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(189);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 138:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(232);
      if (lookahead == 'r') ADVANCE(199);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 139:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(232);
      if (lookahead == 'y') ADVANCE(190);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 140:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(234);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 141:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(216);
      if (lookahead == 'l') ADVANCE(188);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 142:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(236);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 143:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'a') ADVANCE(237);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 144:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(146);
      if (lookahead == 'n') ADVANCE(175);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 145:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(146);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 146:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(154);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 147:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(137);
      if (lookahead == 'h') ADVANCE(134);
      if (lookahead == 't') ADVANCE(138);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 148:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(182);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 149:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'c') ADVANCE(222);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 150:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'd') ADVANCE(200);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 151:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'd') ADVANCE(231);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 152:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(196);
      if (lookahead == 'o') ADVANCE(211);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 153:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(309);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 154:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(206);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 155:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(333);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 156:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(318);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 157:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(321);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 158:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(294);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 159:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(270);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 160:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(324);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 161:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(258);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 162:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(149);
      if (lookahead == 'o') ADVANCE(235);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 163:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(149);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 164:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(209);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 165:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(210);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 166:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'e') ADVANCE(227);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 167:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'f') ADVANCE(168);
      if (lookahead == 'p') ADVANCE(135);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 168:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'f') ADVANCE(218);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 169:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'g') ADVANCE(306);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 170:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'g') ADVANCE(255);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 171:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'g') ADVANCE(174);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 172:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'h') ADVANCE(273);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 173:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'h') ADVANCE(285);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 174:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'h') ADVANCE(225);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 175:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(192);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 176:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(187);
      if (lookahead == 'o') ADVANCE(197);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 177:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(203);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 178:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(207);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 179:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(171);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 180:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(194);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 181:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(204);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 182:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(229);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 183:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'i') ADVANCE(230);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 184:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'k') ADVANCE(158);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 185:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(188);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 186:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(291);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 187:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(186);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 188:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(178);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 189:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(156);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 190:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(161);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 191:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'l') ADVANCE(143);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 192:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'm') ADVANCE(340);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 193:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(336);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 194:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(327);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 195:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(217);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 196:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(233);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 197:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(221);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 198:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'n') ADVANCE(165);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 199:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(184);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 200:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(242);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 201:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(240);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 202:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(241);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 203:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(213);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 204:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'o') ADVANCE(193);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 205:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'p') ADVANCE(264);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 206:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'p') ADVANCE(224);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 207:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'p') ADVANCE(219);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 208:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(201);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 209:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(129);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 210:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(297);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 211:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(198);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 212:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(140);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 213:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'r') ADVANCE(183);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 214:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(153);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 215:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(251);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 216:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(155);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 217:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(191);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 218:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(166);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 219:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 's') ADVANCE(159);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 220:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(172);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 221:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(303);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 222:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(267);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 223:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(276);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 224:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(249);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 225:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(288);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 226:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(312);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 227:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(330);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 228:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(139);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 229:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(244);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 230:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(245);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 231:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(173);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 232:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(239);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 233:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(164);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 234:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(181);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 235:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(142);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 236:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(157);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 237:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 't') ADVANCE(160);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 238:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'u') ADVANCE(212);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 239:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'u') ADVANCE(215);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 240:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'u') ADVANCE(205);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 241:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'u') ADVANCE(226);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 242:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'w') ADVANCE(315);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 243:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'x') ADVANCE(223);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 244:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'y') ADVANCE(300);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 245:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'y') ADVANCE(253);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 246:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead == 'y') ADVANCE(202);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 247:
      ACCEPT_TOKEN(sym_annotation_text);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 248:
      ACCEPT_TOKEN(anon_sym_accept);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 249:
      ACCEPT_TOKEN(anon_sym_accept);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 250:
      ACCEPT_TOKEN(anon_sym_status);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 251:
      ACCEPT_TOKEN(anon_sym_status);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 252:
      ACCEPT_TOKEN(anon_sym_priority);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 253:
      ACCEPT_TOKEN(anon_sym_priority);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 254:
      ACCEPT_TOKEN(anon_sym_tag);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 255:
      ACCEPT_TOKEN(anon_sym_tag);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 256:
      ACCEPT_TOKEN(anon_sym_style);
      END_STATE();
    case 257:
      ACCEPT_TOKEN(anon_sym_style);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 258:
      ACCEPT_TOKEN(anon_sym_style);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 259:
      ACCEPT_TOKEN(anon_sym_LBRACE);
      END_STATE();
    case 260:
      ACCEPT_TOKEN(anon_sym_RBRACE);
      END_STATE();
    case 261:
      ACCEPT_TOKEN(anon_sym_RBRACE);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 262:
      ACCEPT_TOKEN(anon_sym_group);
      END_STATE();
    case 263:
      ACCEPT_TOKEN(anon_sym_group);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 264:
      ACCEPT_TOKEN(anon_sym_group);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 265:
      ACCEPT_TOKEN(anon_sym_rect);
      END_STATE();
    case 266:
      ACCEPT_TOKEN(anon_sym_rect);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 267:
      ACCEPT_TOKEN(anon_sym_rect);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 268:
      ACCEPT_TOKEN(anon_sym_ellipse);
      END_STATE();
    case 269:
      ACCEPT_TOKEN(anon_sym_ellipse);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 270:
      ACCEPT_TOKEN(anon_sym_ellipse);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 271:
      ACCEPT_TOKEN(anon_sym_path);
      END_STATE();
    case 272:
      ACCEPT_TOKEN(anon_sym_path);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 273:
      ACCEPT_TOKEN(anon_sym_path);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 274:
      ACCEPT_TOKEN(anon_sym_text);
      END_STATE();
    case 275:
      ACCEPT_TOKEN(anon_sym_text);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 276:
      ACCEPT_TOKEN(anon_sym_text);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 277:
      ACCEPT_TOKEN(anon_sym_w);
      if (lookahead == 'i') ADVANCE(366);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 278:
      ACCEPT_TOKEN(anon_sym_w);
      if (lookahead == 'i') ADVANCE(26);
      END_STATE();
    case 279:
      ACCEPT_TOKEN(anon_sym_w);
      if (lookahead == 'i') ADVANCE(151);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 280:
      ACCEPT_TOKEN(anon_sym_h);
      if (lookahead == 'e') ADVANCE(396);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 281:
      ACCEPT_TOKEN(anon_sym_h);
      if (lookahead == 'e') ADVANCE(50);
      END_STATE();
    case 282:
      ACCEPT_TOKEN(anon_sym_h);
      if (lookahead == 'e') ADVANCE(179);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 283:
      ACCEPT_TOKEN(anon_sym_width);
      END_STATE();
    case 284:
      ACCEPT_TOKEN(anon_sym_width);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 285:
      ACCEPT_TOKEN(anon_sym_width);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 286:
      ACCEPT_TOKEN(anon_sym_height);
      END_STATE();
    case 287:
      ACCEPT_TOKEN(anon_sym_height);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 288:
      ACCEPT_TOKEN(anon_sym_height);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 289:
      ACCEPT_TOKEN(anon_sym_fill);
      END_STATE();
    case 290:
      ACCEPT_TOKEN(anon_sym_fill);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 291:
      ACCEPT_TOKEN(anon_sym_fill);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 292:
      ACCEPT_TOKEN(anon_sym_stroke);
      END_STATE();
    case 293:
      ACCEPT_TOKEN(anon_sym_stroke);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 294:
      ACCEPT_TOKEN(anon_sym_stroke);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 295:
      ACCEPT_TOKEN(anon_sym_corner);
      END_STATE();
    case 296:
      ACCEPT_TOKEN(anon_sym_corner);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 297:
      ACCEPT_TOKEN(anon_sym_corner);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 298:
      ACCEPT_TOKEN(anon_sym_opacity);
      END_STATE();
    case 299:
      ACCEPT_TOKEN(anon_sym_opacity);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 300:
      ACCEPT_TOKEN(anon_sym_opacity);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 301:
      ACCEPT_TOKEN(anon_sym_font);
      END_STATE();
    case 302:
      ACCEPT_TOKEN(anon_sym_font);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 303:
      ACCEPT_TOKEN(anon_sym_font);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 304:
      ACCEPT_TOKEN(anon_sym_bg);
      END_STATE();
    case 305:
      ACCEPT_TOKEN(anon_sym_bg);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 306:
      ACCEPT_TOKEN(anon_sym_bg);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 307:
      ACCEPT_TOKEN(anon_sym_use);
      END_STATE();
    case 308:
      ACCEPT_TOKEN(anon_sym_use);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 309:
      ACCEPT_TOKEN(anon_sym_use);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 310:
      ACCEPT_TOKEN(anon_sym_layout);
      END_STATE();
    case 311:
      ACCEPT_TOKEN(anon_sym_layout);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 312:
      ACCEPT_TOKEN(anon_sym_layout);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 313:
      ACCEPT_TOKEN(anon_sym_shadow);
      END_STATE();
    case 314:
      ACCEPT_TOKEN(anon_sym_shadow);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 315:
      ACCEPT_TOKEN(anon_sym_shadow);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 316:
      ACCEPT_TOKEN(anon_sym_scale);
      END_STATE();
    case 317:
      ACCEPT_TOKEN(anon_sym_scale);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 318:
      ACCEPT_TOKEN(anon_sym_scale);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 319:
      ACCEPT_TOKEN(anon_sym_rotate);
      END_STATE();
    case 320:
      ACCEPT_TOKEN(anon_sym_rotate);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 321:
      ACCEPT_TOKEN(anon_sym_rotate);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 322:
      ACCEPT_TOKEN(anon_sym_translate);
      END_STATE();
    case 323:
      ACCEPT_TOKEN(anon_sym_translate);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 324:
      ACCEPT_TOKEN(anon_sym_translate);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 325:
      ACCEPT_TOKEN(anon_sym_center_in);
      END_STATE();
    case 326:
      ACCEPT_TOKEN(anon_sym_center_in);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 327:
      ACCEPT_TOKEN(anon_sym_center_in);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 328:
      ACCEPT_TOKEN(anon_sym_offset);
      END_STATE();
    case 329:
      ACCEPT_TOKEN(anon_sym_offset);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 330:
      ACCEPT_TOKEN(anon_sym_offset);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 331:
      ACCEPT_TOKEN(anon_sym_ease);
      END_STATE();
    case 332:
      ACCEPT_TOKEN(anon_sym_ease);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 333:
      ACCEPT_TOKEN(anon_sym_ease);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 334:
      ACCEPT_TOKEN(anon_sym_duration);
      END_STATE();
    case 335:
      ACCEPT_TOKEN(anon_sym_duration);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 336:
      ACCEPT_TOKEN(anon_sym_duration);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 337:
      ACCEPT_TOKEN(anon_sym_EQ);
      END_STATE();
    case 338:
      ACCEPT_TOKEN(anon_sym_anim);
      END_STATE();
    case 339:
      ACCEPT_TOKEN(anon_sym_anim);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 340:
      ACCEPT_TOKEN(anon_sym_anim);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 341:
      ACCEPT_TOKEN(anon_sym_DASH_GT);
      END_STATE();
    case 342:
      ACCEPT_TOKEN(anon_sym_AT);
      END_STATE();
    case 343:
      ACCEPT_TOKEN(anon_sym_AT);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 344:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == '_') ADVANCE(397);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 345:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(467);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 346:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(441);
      if (lookahead == 'r') ADVANCE(394);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 347:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(441);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 348:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(387);
      if (lookahead == 'e') ADVANCE(464);
      if (lookahead == 'r') ADVANCE(351);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 349:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(365);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 350:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(363);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 351:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(413);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 352:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(406);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 353:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(452);
      if (lookahead == 'r') ADVANCE(417);
      if (lookahead == 'y') ADVANCE(407);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 354:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(455);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 355:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(437);
      if (lookahead == 'l') ADVANCE(405);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 356:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(437);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 357:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(457);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 358:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'a') ADVANCE(458);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('b' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 359:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(360);
      if (lookahead == 'n') ADVANCE(392);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 360:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(371);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 361:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(352);
      if (lookahead == 'h') ADVANCE(349);
      if (lookahead == 't') ADVANCE(353);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 362:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(352);
      if (lookahead == 'h') ADVANCE(349);
      if (lookahead == 't') ADVANCE(431);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 363:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(399);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 364:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'c') ADVANCE(443);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 365:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'd') ADVANCE(418);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 366:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'd') ADVANCE(451);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 367:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(414);
      if (lookahead == 'o') ADVANCE(430);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 368:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(464);
      if (lookahead == 'r') ADVANCE(351);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 369:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(464);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 370:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(308);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 371:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(425);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 372:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(332);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 373:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(317);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 374:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(257);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 375:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(320);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 376:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(293);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 377:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(269);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 378:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(323);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 379:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(364);
      if (lookahead == 'o') ADVANCE(456);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 380:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(364);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 381:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(428);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 382:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(429);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 383:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'e') ADVANCE(448);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 384:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'f') ADVANCE(385);
      if (lookahead == 'p') ADVANCE(350);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 385:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'f') ADVANCE(439);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 386:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'g') ADVANCE(305);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 387:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'g') ADVANCE(254);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 388:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'g') ADVANCE(391);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 389:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'h') ADVANCE(272);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 390:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'h') ADVANCE(284);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 391:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'h') ADVANCE(446);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 392:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(409);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 393:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(404);
      if (lookahead == 'o') ADVANCE(415);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 394:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(422);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 395:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(426);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 396:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(388);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 397:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(412);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 398:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(423);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 399:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(449);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 400:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'i') ADVANCE(450);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 401:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'k') ADVANCE(376);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 402:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(405);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 403:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(290);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 404:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(403);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 405:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(395);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 406:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(373);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 407:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(374);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 408:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'l') ADVANCE(358);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 409:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'm') ADVANCE(339);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 410:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(392);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 411:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(335);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 412:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(326);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 413:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(438);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 414:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(454);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 415:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(442);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 416:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'n') ADVANCE(382);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 417:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(401);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 418:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(463);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 419:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(461);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 420:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(456);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 421:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(462);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 422:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(434);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 423:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'o') ADVANCE(411);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 424:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'p') ADVANCE(263);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 425:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'p') ADVANCE(445);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 426:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'p') ADVANCE(440);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 427:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(419);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 428:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(344);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 429:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(296);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 430:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(416);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 431:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(417);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 432:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(351);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 433:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(354);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 434:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'r') ADVANCE(400);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 435:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(370);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 436:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(250);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 437:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(372);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 438:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(408);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 439:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(383);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 440:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 's') ADVANCE(377);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 441:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(389);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 442:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(302);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 443:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(266);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 444:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(275);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 445:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(248);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 446:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(287);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 447:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(311);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 448:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(329);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 449:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(465);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 450:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(466);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 451:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(390);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 452:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(460);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 453:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(468);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 454:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(381);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 455:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(398);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 456:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(357);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 457:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(375);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 458:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 't') ADVANCE(378);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 459:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'u') ADVANCE(433);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 460:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'u') ADVANCE(436);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 461:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'u') ADVANCE(424);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 462:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'u') ADVANCE(447);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 463:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'w') ADVANCE(314);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 464:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'x') ADVANCE(444);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 465:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'y') ADVANCE(299);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 466:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'y') ADVANCE(252);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 467:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'y') ADVANCE(421);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 468:
      ACCEPT_TOKEN(sym_identifier);
      if (lookahead == 'y') ADVANCE(407);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 469:
      ACCEPT_TOKEN(sym_identifier);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'Z') ||
          lookahead == '_' ||
          ('a' <= lookahead && lookahead <= 'z')) ADVANCE(469);
      END_STATE();
    case 470:
      ACCEPT_TOKEN(sym_number);
      END_STATE();
    case 471:
      ACCEPT_TOKEN(sym_number);
      if (lookahead == '.') ADVANCE(111);
      if (lookahead == 'm') ADVANCE(83);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(471);
      END_STATE();
    case 472:
      ACCEPT_TOKEN(sym_number);
      if (lookahead == 'm') ADVANCE(83);
      if (('0' <= lookahead && lookahead <= '9')) ADVANCE(472);
      END_STATE();
    case 473:
      ACCEPT_TOKEN(sym_hex_color);
      END_STATE();
    case 474:
      ACCEPT_TOKEN(sym_hex_color);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(473);
      END_STATE();
    case 475:
      ACCEPT_TOKEN(sym_hex_color);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(474);
      END_STATE();
    case 476:
      ACCEPT_TOKEN(sym_hex_color);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(475);
      END_STATE();
    case 477:
      ACCEPT_TOKEN(sym_hex_color);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(476);
      END_STATE();
    case 478:
      ACCEPT_TOKEN(sym_hex_color);
      if (('0' <= lookahead && lookahead <= '9') ||
          ('A' <= lookahead && lookahead <= 'F') ||
          ('a' <= lookahead && lookahead <= 'f')) ADVANCE(477);
      END_STATE();
    case 479:
      ACCEPT_TOKEN(anon_sym_DQUOTE);
      END_STATE();
    case 480:
      ACCEPT_TOKEN(anon_sym_DQUOTE);
      if (lookahead != 0 &&
          lookahead != '\n') ADVANCE(247);
      END_STATE();
    case 481:
      ACCEPT_TOKEN(aux_sym_string_token1);
      if (lookahead == '\n') ADVANCE(484);
      if (lookahead != 0 &&
          lookahead != '"') ADVANCE(481);
      END_STATE();
    case 482:
      ACCEPT_TOKEN(aux_sym_string_token1);
      if (lookahead == '#') ADVANCE(483);
      if (('\t' <= lookahead && lookahead <= '\r') ||
          lookahead == ' ') ADVANCE(482);
      if (lookahead != 0 &&
          lookahead != '"' &&
          lookahead != '#') ADVANCE(484);
      END_STATE();
    case 483:
      ACCEPT_TOKEN(aux_sym_string_token1);
      if (lookahead == '\n' ||
          lookahead == '#') ADVANCE(484);
      if (lookahead != 0 &&
          lookahead != '"' &&
          lookahead != '#') ADVANCE(481);
      END_STATE();
    case 484:
      ACCEPT_TOKEN(aux_sym_string_token1);
      if (lookahead != 0 &&
          lookahead != '"') ADVANCE(484);
      END_STATE();
    default:
      return false;
  }
}

static const TSLexMode ts_lex_modes[STATE_COUNT] = {
  [0] = {.lex_state = 0},
  [1] = {.lex_state = 116},
  [2] = {.lex_state = 3},
  [3] = {.lex_state = 3},
  [4] = {.lex_state = 1},
  [5] = {.lex_state = 116},
  [6] = {.lex_state = 116},
  [7] = {.lex_state = 116},
  [8] = {.lex_state = 116},
  [9] = {.lex_state = 116},
  [10] = {.lex_state = 116},
  [11] = {.lex_state = 116},
  [12] = {.lex_state = 116},
  [13] = {.lex_state = 116},
  [14] = {.lex_state = 3},
  [15] = {.lex_state = 3},
  [16] = {.lex_state = 3},
  [17] = {.lex_state = 3},
  [18] = {.lex_state = 116},
  [19] = {.lex_state = 4},
  [20] = {.lex_state = 116},
  [21] = {.lex_state = 116},
  [22] = {.lex_state = 116},
  [23] = {.lex_state = 116},
  [24] = {.lex_state = 116},
  [25] = {.lex_state = 116},
  [26] = {.lex_state = 116},
  [27] = {.lex_state = 116},
  [28] = {.lex_state = 116},
  [29] = {.lex_state = 116},
  [30] = {.lex_state = 4},
  [31] = {.lex_state = 116},
  [32] = {.lex_state = 116},
  [33] = {.lex_state = 116},
  [34] = {.lex_state = 4},
  [35] = {.lex_state = 4},
  [36] = {.lex_state = 4},
  [37] = {.lex_state = 4},
  [38] = {.lex_state = 116},
  [39] = {.lex_state = 116},
  [40] = {.lex_state = 116},
  [41] = {.lex_state = 116},
  [42] = {.lex_state = 116},
  [43] = {.lex_state = 115},
  [44] = {.lex_state = 115},
  [45] = {.lex_state = 114},
  [46] = {.lex_state = 116},
  [47] = {.lex_state = 116},
  [48] = {.lex_state = 115},
  [49] = {.lex_state = 115},
  [50] = {.lex_state = 115},
  [51] = {.lex_state = 115},
  [52] = {.lex_state = 5},
  [53] = {.lex_state = 5},
  [54] = {.lex_state = 5},
  [55] = {.lex_state = 116},
  [56] = {.lex_state = 116},
  [57] = {.lex_state = 5},
  [58] = {.lex_state = 5},
  [59] = {.lex_state = 5},
  [60] = {.lex_state = 116},
  [61] = {.lex_state = 116},
  [62] = {.lex_state = 116},
  [63] = {.lex_state = 2},
  [64] = {.lex_state = 116},
  [65] = {.lex_state = 116},
  [66] = {.lex_state = 116},
  [67] = {.lex_state = 116},
  [68] = {.lex_state = 116},
  [69] = {.lex_state = 116},
  [70] = {.lex_state = 8},
  [71] = {.lex_state = 116},
  [72] = {.lex_state = 116},
  [73] = {.lex_state = 116},
  [74] = {.lex_state = 8},
  [75] = {.lex_state = 8},
  [76] = {.lex_state = 116},
  [77] = {.lex_state = 116},
  [78] = {.lex_state = 116},
  [79] = {.lex_state = 116},
  [80] = {.lex_state = 116},
  [81] = {.lex_state = 8},
  [82] = {.lex_state = 116},
  [83] = {.lex_state = 482},
  [84] = {.lex_state = 116},
  [85] = {.lex_state = 8},
  [86] = {.lex_state = 116},
  [87] = {.lex_state = 8},
  [88] = {.lex_state = 8},
  [89] = {.lex_state = 116},
  [90] = {.lex_state = 482},
  [91] = {.lex_state = 116},
  [92] = {.lex_state = 482},
  [93] = {.lex_state = 482},
};

static const uint16_t ts_parse_table[LARGE_STATE_COUNT][SYMBOL_COUNT] = {
  [0] = {
    [ts_builtin_sym_end] = ACTIONS(1),
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(1),
    [anon_sym_COLON] = ACTIONS(1),
    [anon_sym_accept] = ACTIONS(1),
    [anon_sym_status] = ACTIONS(1),
    [anon_sym_priority] = ACTIONS(1),
    [anon_sym_tag] = ACTIONS(1),
    [anon_sym_style] = ACTIONS(1),
    [anon_sym_LBRACE] = ACTIONS(1),
    [anon_sym_RBRACE] = ACTIONS(1),
    [anon_sym_group] = ACTIONS(1),
    [anon_sym_rect] = ACTIONS(1),
    [anon_sym_ellipse] = ACTIONS(1),
    [anon_sym_path] = ACTIONS(1),
    [anon_sym_text] = ACTIONS(1),
    [anon_sym_w] = ACTIONS(1),
    [anon_sym_h] = ACTIONS(1),
    [anon_sym_width] = ACTIONS(1),
    [anon_sym_height] = ACTIONS(1),
    [anon_sym_fill] = ACTIONS(1),
    [anon_sym_stroke] = ACTIONS(1),
    [anon_sym_corner] = ACTIONS(1),
    [anon_sym_opacity] = ACTIONS(1),
    [anon_sym_font] = ACTIONS(1),
    [anon_sym_bg] = ACTIONS(1),
    [anon_sym_use] = ACTIONS(1),
    [anon_sym_layout] = ACTIONS(1),
    [anon_sym_shadow] = ACTIONS(1),
    [anon_sym_scale] = ACTIONS(1),
    [anon_sym_rotate] = ACTIONS(1),
    [anon_sym_translate] = ACTIONS(1),
    [anon_sym_center_in] = ACTIONS(1),
    [anon_sym_offset] = ACTIONS(1),
    [anon_sym_ease] = ACTIONS(1),
    [anon_sym_duration] = ACTIONS(1),
    [anon_sym_EQ] = ACTIONS(1),
    [anon_sym_anim] = ACTIONS(1),
    [anon_sym_DASH_GT] = ACTIONS(1),
    [anon_sym_AT] = ACTIONS(1),
    [sym_identifier] = ACTIONS(1),
    [sym_number] = ACTIONS(1),
    [sym_hex_color] = ACTIONS(1),
    [anon_sym_DQUOTE] = ACTIONS(1),
  },
  [1] = {
    [sym_document] = STATE(68),
    [sym_annotation] = STATE(47),
    [sym_style_block] = STATE(47),
    [sym_node_declaration] = STATE(47),
    [sym_node_kind] = STATE(60),
    [sym_constraint_line] = STATE(47),
    [sym_node_id] = STATE(72),
    [aux_sym_document_repeat1] = STATE(47),
    [ts_builtin_sym_end] = ACTIONS(5),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(9),
    [anon_sym_style] = ACTIONS(11),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_AT] = ACTIONS(15),
  },
  [2] = {
    [sym__value_item] = STATE(3),
    [sym_key_value_pair] = STATE(3),
    [sym_node_id] = STATE(3),
    [sym_string] = STATE(3),
    [aux_sym_property_repeat1] = STATE(3),
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(17),
    [anon_sym_RBRACE] = ACTIONS(17),
    [anon_sym_group] = ACTIONS(19),
    [anon_sym_rect] = ACTIONS(19),
    [anon_sym_ellipse] = ACTIONS(19),
    [anon_sym_path] = ACTIONS(19),
    [anon_sym_text] = ACTIONS(19),
    [anon_sym_w] = ACTIONS(19),
    [anon_sym_h] = ACTIONS(19),
    [anon_sym_width] = ACTIONS(19),
    [anon_sym_height] = ACTIONS(19),
    [anon_sym_fill] = ACTIONS(19),
    [anon_sym_stroke] = ACTIONS(19),
    [anon_sym_corner] = ACTIONS(19),
    [anon_sym_opacity] = ACTIONS(19),
    [anon_sym_font] = ACTIONS(19),
    [anon_sym_bg] = ACTIONS(19),
    [anon_sym_use] = ACTIONS(19),
    [anon_sym_layout] = ACTIONS(19),
    [anon_sym_shadow] = ACTIONS(19),
    [anon_sym_scale] = ACTIONS(19),
    [anon_sym_rotate] = ACTIONS(19),
    [anon_sym_translate] = ACTIONS(19),
    [anon_sym_center_in] = ACTIONS(19),
    [anon_sym_offset] = ACTIONS(19),
    [anon_sym_ease] = ACTIONS(19),
    [anon_sym_duration] = ACTIONS(19),
    [anon_sym_anim] = ACTIONS(19),
    [anon_sym_AT] = ACTIONS(21),
    [sym_identifier] = ACTIONS(23),
    [sym_number] = ACTIONS(25),
    [sym_hex_color] = ACTIONS(25),
    [anon_sym_DQUOTE] = ACTIONS(27),
  },
  [3] = {
    [sym__value_item] = STATE(3),
    [sym_key_value_pair] = STATE(3),
    [sym_node_id] = STATE(3),
    [sym_string] = STATE(3),
    [aux_sym_property_repeat1] = STATE(3),
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(29),
    [anon_sym_RBRACE] = ACTIONS(29),
    [anon_sym_group] = ACTIONS(31),
    [anon_sym_rect] = ACTIONS(31),
    [anon_sym_ellipse] = ACTIONS(31),
    [anon_sym_path] = ACTIONS(31),
    [anon_sym_text] = ACTIONS(31),
    [anon_sym_w] = ACTIONS(31),
    [anon_sym_h] = ACTIONS(31),
    [anon_sym_width] = ACTIONS(31),
    [anon_sym_height] = ACTIONS(31),
    [anon_sym_fill] = ACTIONS(31),
    [anon_sym_stroke] = ACTIONS(31),
    [anon_sym_corner] = ACTIONS(31),
    [anon_sym_opacity] = ACTIONS(31),
    [anon_sym_font] = ACTIONS(31),
    [anon_sym_bg] = ACTIONS(31),
    [anon_sym_use] = ACTIONS(31),
    [anon_sym_layout] = ACTIONS(31),
    [anon_sym_shadow] = ACTIONS(31),
    [anon_sym_scale] = ACTIONS(31),
    [anon_sym_rotate] = ACTIONS(31),
    [anon_sym_translate] = ACTIONS(31),
    [anon_sym_center_in] = ACTIONS(31),
    [anon_sym_offset] = ACTIONS(31),
    [anon_sym_ease] = ACTIONS(31),
    [anon_sym_duration] = ACTIONS(31),
    [anon_sym_anim] = ACTIONS(31),
    [anon_sym_AT] = ACTIONS(33),
    [sym_identifier] = ACTIONS(36),
    [sym_number] = ACTIONS(39),
    [sym_hex_color] = ACTIONS(39),
    [anon_sym_DQUOTE] = ACTIONS(42),
  },
  [4] = {
    [sym_annotation_typed] = STATE(25),
    [sym_annotation_keyword] = STATE(86),
    [sym_string] = STATE(25),
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(45),
    [sym_annotation_text] = ACTIONS(47),
    [anon_sym_accept] = ACTIONS(49),
    [anon_sym_status] = ACTIONS(49),
    [anon_sym_priority] = ACTIONS(49),
    [anon_sym_tag] = ACTIONS(49),
    [anon_sym_RBRACE] = ACTIONS(45),
    [anon_sym_group] = ACTIONS(45),
    [anon_sym_rect] = ACTIONS(45),
    [anon_sym_ellipse] = ACTIONS(45),
    [anon_sym_path] = ACTIONS(45),
    [anon_sym_text] = ACTIONS(45),
    [anon_sym_w] = ACTIONS(45),
    [anon_sym_h] = ACTIONS(45),
    [anon_sym_width] = ACTIONS(45),
    [anon_sym_height] = ACTIONS(45),
    [anon_sym_fill] = ACTIONS(45),
    [anon_sym_stroke] = ACTIONS(45),
    [anon_sym_corner] = ACTIONS(45),
    [anon_sym_opacity] = ACTIONS(45),
    [anon_sym_font] = ACTIONS(45),
    [anon_sym_bg] = ACTIONS(45),
    [anon_sym_use] = ACTIONS(45),
    [anon_sym_layout] = ACTIONS(45),
    [anon_sym_shadow] = ACTIONS(45),
    [anon_sym_scale] = ACTIONS(45),
    [anon_sym_rotate] = ACTIONS(45),
    [anon_sym_translate] = ACTIONS(45),
    [anon_sym_center_in] = ACTIONS(45),
    [anon_sym_offset] = ACTIONS(45),
    [anon_sym_ease] = ACTIONS(45),
    [anon_sym_duration] = ACTIONS(45),
    [anon_sym_anim] = ACTIONS(45),
    [anon_sym_DQUOTE] = ACTIONS(51),
  },
  [5] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(12),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(12),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(55),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [6] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(6),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(6),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(63),
    [anon_sym_RBRACE] = ACTIONS(66),
    [anon_sym_group] = ACTIONS(68),
    [anon_sym_rect] = ACTIONS(68),
    [anon_sym_ellipse] = ACTIONS(68),
    [anon_sym_path] = ACTIONS(68),
    [anon_sym_text] = ACTIONS(68),
    [anon_sym_w] = ACTIONS(71),
    [anon_sym_h] = ACTIONS(71),
    [anon_sym_width] = ACTIONS(74),
    [anon_sym_height] = ACTIONS(74),
    [anon_sym_fill] = ACTIONS(74),
    [anon_sym_stroke] = ACTIONS(74),
    [anon_sym_corner] = ACTIONS(74),
    [anon_sym_opacity] = ACTIONS(74),
    [anon_sym_font] = ACTIONS(74),
    [anon_sym_bg] = ACTIONS(74),
    [anon_sym_use] = ACTIONS(74),
    [anon_sym_layout] = ACTIONS(74),
    [anon_sym_shadow] = ACTIONS(74),
    [anon_sym_scale] = ACTIONS(74),
    [anon_sym_rotate] = ACTIONS(74),
    [anon_sym_translate] = ACTIONS(74),
    [anon_sym_center_in] = ACTIONS(74),
    [anon_sym_offset] = ACTIONS(74),
    [anon_sym_ease] = ACTIONS(74),
    [anon_sym_duration] = ACTIONS(74),
    [anon_sym_anim] = ACTIONS(77),
  },
  [7] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(6),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(6),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(80),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [8] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(13),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(13),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(82),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [9] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(7),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(7),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(84),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [10] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(6),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(6),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(86),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [11] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(10),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(10),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(88),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [12] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(6),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(6),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(90),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [13] = {
    [sym_annotation] = STATE(31),
    [sym_node_declaration] = STATE(31),
    [sym_node_kind] = STATE(60),
    [sym_node_body_item] = STATE(6),
    [sym_property] = STATE(31),
    [sym_property_name] = STATE(77),
    [sym_anim_block] = STATE(31),
    [aux_sym_node_declaration_repeat1] = STATE(6),
    [sym_comment] = ACTIONS(7),
    [anon_sym_POUND_POUND] = ACTIONS(53),
    [anon_sym_RBRACE] = ACTIONS(92),
    [anon_sym_group] = ACTIONS(13),
    [anon_sym_rect] = ACTIONS(13),
    [anon_sym_ellipse] = ACTIONS(13),
    [anon_sym_path] = ACTIONS(13),
    [anon_sym_text] = ACTIONS(13),
    [anon_sym_w] = ACTIONS(57),
    [anon_sym_h] = ACTIONS(57),
    [anon_sym_width] = ACTIONS(59),
    [anon_sym_height] = ACTIONS(59),
    [anon_sym_fill] = ACTIONS(59),
    [anon_sym_stroke] = ACTIONS(59),
    [anon_sym_corner] = ACTIONS(59),
    [anon_sym_opacity] = ACTIONS(59),
    [anon_sym_font] = ACTIONS(59),
    [anon_sym_bg] = ACTIONS(59),
    [anon_sym_use] = ACTIONS(59),
    [anon_sym_layout] = ACTIONS(59),
    [anon_sym_shadow] = ACTIONS(59),
    [anon_sym_scale] = ACTIONS(59),
    [anon_sym_rotate] = ACTIONS(59),
    [anon_sym_translate] = ACTIONS(59),
    [anon_sym_center_in] = ACTIONS(59),
    [anon_sym_offset] = ACTIONS(59),
    [anon_sym_ease] = ACTIONS(59),
    [anon_sym_duration] = ACTIONS(59),
    [anon_sym_anim] = ACTIONS(61),
  },
  [14] = {
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(94),
    [anon_sym_RBRACE] = ACTIONS(94),
    [anon_sym_group] = ACTIONS(96),
    [anon_sym_rect] = ACTIONS(96),
    [anon_sym_ellipse] = ACTIONS(96),
    [anon_sym_path] = ACTIONS(96),
    [anon_sym_text] = ACTIONS(96),
    [anon_sym_w] = ACTIONS(96),
    [anon_sym_h] = ACTIONS(96),
    [anon_sym_width] = ACTIONS(96),
    [anon_sym_height] = ACTIONS(96),
    [anon_sym_fill] = ACTIONS(96),
    [anon_sym_stroke] = ACTIONS(96),
    [anon_sym_corner] = ACTIONS(96),
    [anon_sym_opacity] = ACTIONS(96),
    [anon_sym_font] = ACTIONS(96),
    [anon_sym_bg] = ACTIONS(96),
    [anon_sym_use] = ACTIONS(96),
    [anon_sym_layout] = ACTIONS(96),
    [anon_sym_shadow] = ACTIONS(96),
    [anon_sym_scale] = ACTIONS(96),
    [anon_sym_rotate] = ACTIONS(96),
    [anon_sym_translate] = ACTIONS(96),
    [anon_sym_center_in] = ACTIONS(96),
    [anon_sym_offset] = ACTIONS(96),
    [anon_sym_ease] = ACTIONS(96),
    [anon_sym_duration] = ACTIONS(96),
    [anon_sym_EQ] = ACTIONS(98),
    [anon_sym_anim] = ACTIONS(96),
    [anon_sym_AT] = ACTIONS(94),
    [sym_identifier] = ACTIONS(96),
    [sym_number] = ACTIONS(94),
    [sym_hex_color] = ACTIONS(94),
    [anon_sym_DQUOTE] = ACTIONS(94),
  },
  [15] = {
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(100),
    [anon_sym_RBRACE] = ACTIONS(100),
    [anon_sym_group] = ACTIONS(102),
    [anon_sym_rect] = ACTIONS(102),
    [anon_sym_ellipse] = ACTIONS(102),
    [anon_sym_path] = ACTIONS(102),
    [anon_sym_text] = ACTIONS(102),
    [anon_sym_w] = ACTIONS(102),
    [anon_sym_h] = ACTIONS(102),
    [anon_sym_width] = ACTIONS(102),
    [anon_sym_height] = ACTIONS(102),
    [anon_sym_fill] = ACTIONS(102),
    [anon_sym_stroke] = ACTIONS(102),
    [anon_sym_corner] = ACTIONS(102),
    [anon_sym_opacity] = ACTIONS(102),
    [anon_sym_font] = ACTIONS(102),
    [anon_sym_bg] = ACTIONS(102),
    [anon_sym_use] = ACTIONS(102),
    [anon_sym_layout] = ACTIONS(102),
    [anon_sym_shadow] = ACTIONS(102),
    [anon_sym_scale] = ACTIONS(102),
    [anon_sym_rotate] = ACTIONS(102),
    [anon_sym_translate] = ACTIONS(102),
    [anon_sym_center_in] = ACTIONS(102),
    [anon_sym_offset] = ACTIONS(102),
    [anon_sym_ease] = ACTIONS(102),
    [anon_sym_duration] = ACTIONS(102),
    [anon_sym_anim] = ACTIONS(102),
    [anon_sym_AT] = ACTIONS(100),
    [sym_identifier] = ACTIONS(102),
    [sym_number] = ACTIONS(100),
    [sym_hex_color] = ACTIONS(100),
    [anon_sym_DQUOTE] = ACTIONS(100),
  },
  [16] = {
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(104),
    [anon_sym_RBRACE] = ACTIONS(104),
    [anon_sym_group] = ACTIONS(106),
    [anon_sym_rect] = ACTIONS(106),
    [anon_sym_ellipse] = ACTIONS(106),
    [anon_sym_path] = ACTIONS(106),
    [anon_sym_text] = ACTIONS(106),
    [anon_sym_w] = ACTIONS(106),
    [anon_sym_h] = ACTIONS(106),
    [anon_sym_width] = ACTIONS(106),
    [anon_sym_height] = ACTIONS(106),
    [anon_sym_fill] = ACTIONS(106),
    [anon_sym_stroke] = ACTIONS(106),
    [anon_sym_corner] = ACTIONS(106),
    [anon_sym_opacity] = ACTIONS(106),
    [anon_sym_font] = ACTIONS(106),
    [anon_sym_bg] = ACTIONS(106),
    [anon_sym_use] = ACTIONS(106),
    [anon_sym_layout] = ACTIONS(106),
    [anon_sym_shadow] = ACTIONS(106),
    [anon_sym_scale] = ACTIONS(106),
    [anon_sym_rotate] = ACTIONS(106),
    [anon_sym_translate] = ACTIONS(106),
    [anon_sym_center_in] = ACTIONS(106),
    [anon_sym_offset] = ACTIONS(106),
    [anon_sym_ease] = ACTIONS(106),
    [anon_sym_duration] = ACTIONS(106),
    [anon_sym_anim] = ACTIONS(106),
    [anon_sym_AT] = ACTIONS(104),
    [sym_identifier] = ACTIONS(106),
    [sym_number] = ACTIONS(104),
    [sym_hex_color] = ACTIONS(104),
    [anon_sym_DQUOTE] = ACTIONS(104),
  },
  [17] = {
    [sym_comment] = ACTIONS(3),
    [anon_sym_POUND_POUND] = ACTIONS(108),
    [anon_sym_RBRACE] = ACTIONS(108),
    [anon_sym_group] = ACTIONS(110),
    [anon_sym_rect] = ACTIONS(110),
    [anon_sym_ellipse] = ACTIONS(110),
    [anon_sym_path] = ACTIONS(110),
    [anon_sym_text] = ACTIONS(110),
    [anon_sym_w] = ACTIONS(110),
    [anon_sym_h] = ACTIONS(110),
    [anon_sym_width] = ACTIONS(110),
    [anon_sym_height] = ACTIONS(110),
    [anon_sym_fill] = ACTIONS(110),
    [anon_sym_stroke] = ACTIONS(110),
    [anon_sym_corner] = ACTIONS(110),
    [anon_sym_opacity] = ACTIONS(110),
    [anon_sym_font] = ACTIONS(110),
    [anon_sym_bg] = ACTIONS(110),
    [anon_sym_use] = ACTIONS(110),
    [anon_sym_layout] = ACTIONS(110),
    [anon_sym_shadow] = ACTIONS(110),
    [anon_sym_scale] = ACTIONS(110),
    [anon_sym_rotate] = ACTIONS(110),
    [anon_sym_translate] = ACTIONS(110),
    [anon_sym_center_in] = ACTIONS(110),
    [anon_sym_offset] = ACTIONS(110),
    [anon_sym_ease] = ACTIONS(110),
    [anon_sym_duration] = ACTIONS(110),
    [anon_sym_anim] = ACTIONS(110),
    [anon_sym_AT] = ACTIONS(108),
    [sym_identifier] = ACTIONS(110),
    [sym_number] = ACTIONS(108),
    [sym_hex_color] = ACTIONS(108),
    [anon_sym_DQUOTE] = ACTIONS(108),
  },
};

static const uint16_t ts_small_parse_table[] = {
  [0] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(102), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(100), 30,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_LBRACE,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [40] = 8,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(29), 1,
      anon_sym_RBRACE,
    ACTIONS(112), 1,
      anon_sym_AT,
    ACTIONS(115), 1,
      sym_identifier,
    ACTIONS(121), 1,
      anon_sym_DQUOTE,
    ACTIONS(118), 2,
      sym_number,
      sym_hex_color,
    STATE(19), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
    ACTIONS(31), 20,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [89] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(126), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(124), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [128] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(130), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(128), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [167] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(134), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(132), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [206] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(138), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(136), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [245] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(142), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(140), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [284] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(146), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(144), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [323] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(150), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(148), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [362] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(154), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(152), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [401] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(158), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(156), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [440] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(162), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(160), 29,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
      anon_sym_AT,
  [479] = 8,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(17), 1,
      anon_sym_RBRACE,
    ACTIONS(164), 1,
      anon_sym_AT,
    ACTIONS(166), 1,
      sym_identifier,
    ACTIONS(170), 1,
      anon_sym_DQUOTE,
    ACTIONS(168), 2,
      sym_number,
      sym_hex_color,
    STATE(19), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
    ACTIONS(19), 20,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [528] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(174), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(172), 26,
      anon_sym_POUND_POUND,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
  [564] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(178), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(176), 26,
      anon_sym_POUND_POUND,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
  [600] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(182), 2,
      anon_sym_w,
      anon_sym_h,
    ACTIONS(180), 26,
      anon_sym_POUND_POUND,
      anon_sym_RBRACE,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      anon_sym_anim,
  [636] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(184), 1,
      anon_sym_EQ,
    ACTIONS(94), 5,
      anon_sym_RBRACE,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(96), 21,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      sym_identifier,
  [673] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(100), 5,
      anon_sym_RBRACE,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(102), 21,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      sym_identifier,
  [707] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(104), 5,
      anon_sym_RBRACE,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(106), 21,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      sym_identifier,
  [741] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(108), 5,
      anon_sym_RBRACE,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(110), 21,
      anon_sym_w,
      anon_sym_h,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
      sym_identifier,
  [775] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(186), 1,
      anon_sym_RBRACE,
    STATE(91), 1,
      sym_property_name,
    ACTIONS(57), 2,
      anon_sym_w,
      anon_sym_h,
    STATE(42), 2,
      sym_property,
      aux_sym_style_block_repeat1,
    ACTIONS(59), 18,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [813] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(188), 1,
      anon_sym_RBRACE,
    STATE(91), 1,
      sym_property_name,
    ACTIONS(57), 2,
      anon_sym_w,
      anon_sym_h,
    STATE(40), 2,
      sym_property,
      aux_sym_style_block_repeat1,
    ACTIONS(59), 18,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [851] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(190), 1,
      anon_sym_RBRACE,
    STATE(91), 1,
      sym_property_name,
    ACTIONS(192), 2,
      anon_sym_w,
      anon_sym_h,
    STATE(40), 2,
      sym_property,
      aux_sym_style_block_repeat1,
    ACTIONS(195), 18,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [889] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(198), 1,
      anon_sym_RBRACE,
    STATE(91), 1,
      sym_property_name,
    ACTIONS(57), 2,
      anon_sym_w,
      anon_sym_h,
    STATE(39), 2,
      sym_property,
      aux_sym_style_block_repeat1,
    ACTIONS(59), 18,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [927] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(200), 1,
      anon_sym_RBRACE,
    STATE(91), 1,
      sym_property_name,
    ACTIONS(57), 2,
      anon_sym_w,
      anon_sym_h,
    STATE(40), 2,
      sym_property,
      aux_sym_style_block_repeat1,
    ACTIONS(59), 18,
      anon_sym_width,
      anon_sym_height,
      anon_sym_fill,
      anon_sym_stroke,
      anon_sym_corner,
      anon_sym_opacity,
      anon_sym_font,
      anon_sym_bg,
      anon_sym_use,
      anon_sym_layout,
      anon_sym_shadow,
      anon_sym_scale,
      anon_sym_rotate,
      anon_sym_translate,
      anon_sym_center_in,
      anon_sym_offset,
      anon_sym_ease,
      anon_sym_duration,
  [965] = 8,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(206), 1,
      anon_sym_AT,
    ACTIONS(208), 1,
      sym_identifier,
    ACTIONS(212), 1,
      anon_sym_DQUOTE,
    ACTIONS(202), 2,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
    ACTIONS(210), 2,
      sym_number,
      sym_hex_color,
    STATE(44), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
    ACTIONS(204), 6,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
  [1001] = 8,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(214), 1,
      anon_sym_AT,
    ACTIONS(217), 1,
      sym_identifier,
    ACTIONS(223), 1,
      anon_sym_DQUOTE,
    ACTIONS(29), 2,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
    ACTIONS(220), 2,
      sym_number,
      sym_hex_color,
    STATE(44), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
    ACTIONS(31), 6,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
  [1037] = 8,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(47), 1,
      sym_annotation_text,
    ACTIONS(51), 1,
      anon_sym_DQUOTE,
    ACTIONS(226), 1,
      ts_builtin_sym_end,
    STATE(86), 1,
      sym_annotation_keyword,
    STATE(25), 2,
      sym_annotation_typed,
      sym_string,
    ACTIONS(49), 4,
      anon_sym_accept,
      anon_sym_status,
      anon_sym_priority,
      anon_sym_tag,
    ACTIONS(45), 8,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_AT,
  [1073] = 9,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(228), 1,
      ts_builtin_sym_end,
    ACTIONS(230), 1,
      anon_sym_POUND_POUND,
    ACTIONS(233), 1,
      anon_sym_style,
    ACTIONS(239), 1,
      anon_sym_AT,
    STATE(60), 1,
      sym_node_kind,
    STATE(72), 1,
      sym_node_id,
    ACTIONS(236), 5,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
    STATE(46), 5,
      sym_annotation,
      sym_style_block,
      sym_node_declaration,
      sym_constraint_line,
      aux_sym_document_repeat1,
  [1109] = 9,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(9), 1,
      anon_sym_POUND_POUND,
    ACTIONS(11), 1,
      anon_sym_style,
    ACTIONS(15), 1,
      anon_sym_AT,
    ACTIONS(242), 1,
      ts_builtin_sym_end,
    STATE(60), 1,
      sym_node_kind,
    STATE(72), 1,
      sym_node_id,
    ACTIONS(13), 5,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
    STATE(46), 5,
      sym_annotation,
      sym_style_block,
      sym_node_declaration,
      sym_constraint_line,
      aux_sym_document_repeat1,
  [1145] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(244), 1,
      anon_sym_EQ,
    ACTIONS(94), 6,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(96), 7,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      sym_identifier,
  [1169] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(104), 6,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(106), 7,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      sym_identifier,
  [1190] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(108), 6,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(110), 7,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      sym_identifier,
  [1211] = 3,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(100), 6,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_AT,
      sym_number,
      sym_hex_color,
      anon_sym_DQUOTE,
    ACTIONS(102), 7,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      sym_identifier,
  [1232] = 6,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(206), 1,
      anon_sym_AT,
    ACTIONS(212), 1,
      anon_sym_DQUOTE,
    ACTIONS(246), 1,
      sym_identifier,
    ACTIONS(248), 2,
      sym_number,
      sym_hex_color,
    STATE(43), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
  [1256] = 6,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(21), 1,
      anon_sym_AT,
    ACTIONS(27), 1,
      anon_sym_DQUOTE,
    ACTIONS(250), 1,
      sym_identifier,
    ACTIONS(252), 2,
      sym_number,
      sym_hex_color,
    STATE(2), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
  [1280] = 6,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(164), 1,
      anon_sym_AT,
    ACTIONS(170), 1,
      anon_sym_DQUOTE,
    ACTIONS(254), 1,
      sym_identifier,
    ACTIONS(256), 2,
      sym_number,
      sym_hex_color,
    STATE(30), 5,
      sym__value_item,
      sym_key_value_pair,
      sym_node_id,
      sym_string,
      aux_sym_property_repeat1,
  [1304] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(258), 9,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_AT,
  [1319] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(260), 9,
      ts_builtin_sym_end,
      anon_sym_POUND_POUND,
      anon_sym_style,
      anon_sym_group,
      anon_sym_rect,
      anon_sym_ellipse,
      anon_sym_path,
      anon_sym_text,
      anon_sym_AT,
  [1334] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(212), 1,
      anon_sym_DQUOTE,
    STATE(50), 1,
      sym_string,
    ACTIONS(262), 3,
      sym_identifier,
      sym_number,
      sym_hex_color,
  [1349] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(170), 1,
      anon_sym_DQUOTE,
    STATE(37), 1,
      sym_string,
    ACTIONS(264), 3,
      sym_identifier,
      sym_number,
      sym_hex_color,
  [1364] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(27), 1,
      anon_sym_DQUOTE,
    STATE(17), 1,
      sym_string,
    ACTIONS(266), 3,
      sym_identifier,
      sym_number,
      sym_hex_color,
  [1379] = 6,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(15), 1,
      anon_sym_AT,
    ACTIONS(268), 1,
      anon_sym_LBRACE,
    ACTIONS(270), 1,
      anon_sym_DQUOTE,
    STATE(62), 1,
      sym_node_id,
    STATE(78), 1,
      sym_string,
  [1398] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(104), 3,
      anon_sym_LBRACE,
      anon_sym_DASH_GT,
      anon_sym_DQUOTE,
  [1407] = 4,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(270), 1,
      anon_sym_DQUOTE,
    ACTIONS(272), 1,
      anon_sym_LBRACE,
    STATE(80), 1,
      sym_string,
  [1420] = 4,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(51), 1,
      anon_sym_DQUOTE,
    ACTIONS(274), 1,
      sym_annotation_text,
    STATE(27), 1,
      sym_string,
  [1433] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(276), 3,
      anon_sym_LBRACE,
      anon_sym_AT,
      anon_sym_DQUOTE,
  [1442] = 3,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(278), 1,
      anon_sym_COLON,
    STATE(71), 1,
      sym_anim_trigger,
  [1452] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(280), 1,
      anon_sym_DQUOTE,
  [1459] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(282), 1,
      anon_sym_LBRACE,
  [1466] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(284), 1,
      ts_builtin_sym_end,
  [1473] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(286), 1,
      anon_sym_DQUOTE,
  [1480] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(288), 1,
      sym_identifier,
  [1487] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(290), 1,
      anon_sym_LBRACE,
  [1494] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(292), 1,
      anon_sym_DASH_GT,
  [1501] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(294), 1,
      anon_sym_COLON,
  [1508] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(296), 1,
      sym_identifier,
  [1515] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(298), 1,
      sym_identifier,
  [1522] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(300), 1,
      anon_sym_LBRACE,
  [1529] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(302), 1,
      anon_sym_COLON,
  [1536] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(304), 1,
      anon_sym_LBRACE,
  [1543] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(306), 1,
      anon_sym_COLON,
  [1550] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(308), 1,
      anon_sym_LBRACE,
  [1557] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(310), 1,
      sym_identifier,
  [1564] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(312), 1,
      anon_sym_DQUOTE,
  [1571] = 2,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(314), 1,
      aux_sym_string_token1,
  [1578] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(316), 1,
      anon_sym_COLON,
  [1585] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(318), 1,
      sym_identifier,
  [1592] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(320), 1,
      anon_sym_COLON,
  [1599] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(322), 1,
      sym_identifier,
  [1606] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(324), 1,
      sym_identifier,
  [1613] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(326), 1,
      anon_sym_DQUOTE,
  [1620] = 2,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(328), 1,
      aux_sym_string_token1,
  [1627] = 2,
    ACTIONS(7), 1,
      sym_comment,
    ACTIONS(330), 1,
      anon_sym_COLON,
  [1634] = 2,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(332), 1,
      aux_sym_string_token1,
  [1641] = 2,
    ACTIONS(3), 1,
      sym_comment,
    ACTIONS(334), 1,
      aux_sym_string_token1,
};

static const uint32_t ts_small_parse_table_map[] = {
  [SMALL_STATE(18)] = 0,
  [SMALL_STATE(19)] = 40,
  [SMALL_STATE(20)] = 89,
  [SMALL_STATE(21)] = 128,
  [SMALL_STATE(22)] = 167,
  [SMALL_STATE(23)] = 206,
  [SMALL_STATE(24)] = 245,
  [SMALL_STATE(25)] = 284,
  [SMALL_STATE(26)] = 323,
  [SMALL_STATE(27)] = 362,
  [SMALL_STATE(28)] = 401,
  [SMALL_STATE(29)] = 440,
  [SMALL_STATE(30)] = 479,
  [SMALL_STATE(31)] = 528,
  [SMALL_STATE(32)] = 564,
  [SMALL_STATE(33)] = 600,
  [SMALL_STATE(34)] = 636,
  [SMALL_STATE(35)] = 673,
  [SMALL_STATE(36)] = 707,
  [SMALL_STATE(37)] = 741,
  [SMALL_STATE(38)] = 775,
  [SMALL_STATE(39)] = 813,
  [SMALL_STATE(40)] = 851,
  [SMALL_STATE(41)] = 889,
  [SMALL_STATE(42)] = 927,
  [SMALL_STATE(43)] = 965,
  [SMALL_STATE(44)] = 1001,
  [SMALL_STATE(45)] = 1037,
  [SMALL_STATE(46)] = 1073,
  [SMALL_STATE(47)] = 1109,
  [SMALL_STATE(48)] = 1145,
  [SMALL_STATE(49)] = 1169,
  [SMALL_STATE(50)] = 1190,
  [SMALL_STATE(51)] = 1211,
  [SMALL_STATE(52)] = 1232,
  [SMALL_STATE(53)] = 1256,
  [SMALL_STATE(54)] = 1280,
  [SMALL_STATE(55)] = 1304,
  [SMALL_STATE(56)] = 1319,
  [SMALL_STATE(57)] = 1334,
  [SMALL_STATE(58)] = 1349,
  [SMALL_STATE(59)] = 1364,
  [SMALL_STATE(60)] = 1379,
  [SMALL_STATE(61)] = 1398,
  [SMALL_STATE(62)] = 1407,
  [SMALL_STATE(63)] = 1420,
  [SMALL_STATE(64)] = 1433,
  [SMALL_STATE(65)] = 1442,
  [SMALL_STATE(66)] = 1452,
  [SMALL_STATE(67)] = 1459,
  [SMALL_STATE(68)] = 1466,
  [SMALL_STATE(69)] = 1473,
  [SMALL_STATE(70)] = 1480,
  [SMALL_STATE(71)] = 1487,
  [SMALL_STATE(72)] = 1494,
  [SMALL_STATE(73)] = 1501,
  [SMALL_STATE(74)] = 1508,
  [SMALL_STATE(75)] = 1515,
  [SMALL_STATE(76)] = 1522,
  [SMALL_STATE(77)] = 1529,
  [SMALL_STATE(78)] = 1536,
  [SMALL_STATE(79)] = 1543,
  [SMALL_STATE(80)] = 1550,
  [SMALL_STATE(81)] = 1557,
  [SMALL_STATE(82)] = 1564,
  [SMALL_STATE(83)] = 1571,
  [SMALL_STATE(84)] = 1578,
  [SMALL_STATE(85)] = 1585,
  [SMALL_STATE(86)] = 1592,
  [SMALL_STATE(87)] = 1599,
  [SMALL_STATE(88)] = 1606,
  [SMALL_STATE(89)] = 1613,
  [SMALL_STATE(90)] = 1620,
  [SMALL_STATE(91)] = 1627,
  [SMALL_STATE(92)] = 1634,
  [SMALL_STATE(93)] = 1641,
};

static const TSParseActionEntry ts_parse_actions[] = {
  [0] = {.entry = {.count = 0, .reusable = false}},
  [1] = {.entry = {.count = 1, .reusable = false}}, RECOVER(),
  [3] = {.entry = {.count = 1, .reusable = false}}, SHIFT_EXTRA(),
  [5] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_document, 0, 0, 0),
  [7] = {.entry = {.count = 1, .reusable = true}}, SHIFT_EXTRA(),
  [9] = {.entry = {.count = 1, .reusable = true}}, SHIFT(45),
  [11] = {.entry = {.count = 1, .reusable = true}}, SHIFT(75),
  [13] = {.entry = {.count = 1, .reusable = true}}, SHIFT(64),
  [15] = {.entry = {.count = 1, .reusable = true}}, SHIFT(74),
  [17] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_property, 3, 0, 6),
  [19] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_property, 3, 0, 6),
  [21] = {.entry = {.count = 1, .reusable = true}}, SHIFT(81),
  [23] = {.entry = {.count = 1, .reusable = false}}, SHIFT(14),
  [25] = {.entry = {.count = 1, .reusable = true}}, SHIFT(3),
  [27] = {.entry = {.count = 1, .reusable = true}}, SHIFT(90),
  [29] = {.entry = {.count = 1, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0),
  [31] = {.entry = {.count = 1, .reusable = false}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0),
  [33] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(81),
  [36] = {.entry = {.count = 2, .reusable = false}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(14),
  [39] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(3),
  [42] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(90),
  [45] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_annotation, 1, 0, 0),
  [47] = {.entry = {.count = 1, .reusable = false}}, SHIFT(25),
  [49] = {.entry = {.count = 1, .reusable = false}}, SHIFT(79),
  [51] = {.entry = {.count = 1, .reusable = false}}, SHIFT(83),
  [53] = {.entry = {.count = 1, .reusable = true}}, SHIFT(4),
  [55] = {.entry = {.count = 1, .reusable = true}}, SHIFT(24),
  [57] = {.entry = {.count = 1, .reusable = false}}, SHIFT(73),
  [59] = {.entry = {.count = 1, .reusable = true}}, SHIFT(73),
  [61] = {.entry = {.count = 1, .reusable = true}}, SHIFT(65),
  [63] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0), SHIFT_REPEAT(4),
  [66] = {.entry = {.count = 1, .reusable = true}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0),
  [68] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0), SHIFT_REPEAT(64),
  [71] = {.entry = {.count = 2, .reusable = false}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0), SHIFT_REPEAT(73),
  [74] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0), SHIFT_REPEAT(73),
  [77] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_node_declaration_repeat1, 2, 0, 0), SHIFT_REPEAT(65),
  [80] = {.entry = {.count = 1, .reusable = true}}, SHIFT(26),
  [82] = {.entry = {.count = 1, .reusable = true}}, SHIFT(23),
  [84] = {.entry = {.count = 1, .reusable = true}}, SHIFT(21),
  [86] = {.entry = {.count = 1, .reusable = true}}, SHIFT(20),
  [88] = {.entry = {.count = 1, .reusable = true}}, SHIFT(22),
  [90] = {.entry = {.count = 1, .reusable = true}}, SHIFT(28),
  [92] = {.entry = {.count = 1, .reusable = true}}, SHIFT(29),
  [94] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym__value_item, 1, 0, 0),
  [96] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym__value_item, 1, 0, 0),
  [98] = {.entry = {.count = 1, .reusable = true}}, SHIFT(59),
  [100] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_string, 3, 0, 0),
  [102] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_string, 3, 0, 0),
  [104] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_id, 2, 0, 0),
  [106] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_id, 2, 0, 0),
  [108] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_key_value_pair, 3, 0, 0),
  [110] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_key_value_pair, 3, 0, 0),
  [112] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(88),
  [115] = {.entry = {.count = 2, .reusable = false}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(34),
  [118] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(19),
  [121] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(93),
  [124] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 4, 0, 1),
  [126] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 4, 0, 1),
  [128] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 4, 0, 4),
  [130] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 4, 0, 4),
  [132] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 3, 0, 1),
  [134] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 3, 0, 1),
  [136] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 5, 0, 7),
  [138] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 5, 0, 7),
  [140] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 4, 0, 5),
  [142] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 4, 0, 5),
  [144] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_annotation, 2, 0, 0),
  [146] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_annotation, 2, 0, 0),
  [148] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 5, 0, 4),
  [150] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 5, 0, 4),
  [152] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_annotation_typed, 3, 0, 2),
  [154] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_annotation_typed, 3, 0, 2),
  [156] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 5, 0, 5),
  [158] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 5, 0, 5),
  [160] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_declaration, 6, 0, 7),
  [162] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_declaration, 6, 0, 7),
  [164] = {.entry = {.count = 1, .reusable = true}}, SHIFT(88),
  [166] = {.entry = {.count = 1, .reusable = false}}, SHIFT(34),
  [168] = {.entry = {.count = 1, .reusable = true}}, SHIFT(19),
  [170] = {.entry = {.count = 1, .reusable = true}}, SHIFT(93),
  [172] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_body_item, 1, 0, 0),
  [174] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_node_body_item, 1, 0, 0),
  [176] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_anim_block, 4, 0, 9),
  [178] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_anim_block, 4, 0, 9),
  [180] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_anim_block, 5, 0, 9),
  [182] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_anim_block, 5, 0, 9),
  [184] = {.entry = {.count = 1, .reusable = true}}, SHIFT(58),
  [186] = {.entry = {.count = 1, .reusable = true}}, SHIFT(55),
  [188] = {.entry = {.count = 1, .reusable = true}}, SHIFT(33),
  [190] = {.entry = {.count = 1, .reusable = true}}, REDUCE(aux_sym_style_block_repeat1, 2, 0, 0),
  [192] = {.entry = {.count = 2, .reusable = false}}, REDUCE(aux_sym_style_block_repeat1, 2, 0, 0), SHIFT_REPEAT(73),
  [195] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_style_block_repeat1, 2, 0, 0), SHIFT_REPEAT(73),
  [198] = {.entry = {.count = 1, .reusable = true}}, SHIFT(32),
  [200] = {.entry = {.count = 1, .reusable = true}}, SHIFT(56),
  [202] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_constraint_line, 5, 0, 8),
  [204] = {.entry = {.count = 1, .reusable = false}}, REDUCE(sym_constraint_line, 5, 0, 8),
  [206] = {.entry = {.count = 1, .reusable = true}}, SHIFT(85),
  [208] = {.entry = {.count = 1, .reusable = false}}, SHIFT(48),
  [210] = {.entry = {.count = 1, .reusable = true}}, SHIFT(44),
  [212] = {.entry = {.count = 1, .reusable = true}}, SHIFT(92),
  [214] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(85),
  [217] = {.entry = {.count = 2, .reusable = false}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(48),
  [220] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(44),
  [223] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_property_repeat1, 2, 0, 0), SHIFT_REPEAT(92),
  [226] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_annotation, 1, 0, 0),
  [228] = {.entry = {.count = 1, .reusable = true}}, REDUCE(aux_sym_document_repeat1, 2, 0, 0),
  [230] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_document_repeat1, 2, 0, 0), SHIFT_REPEAT(45),
  [233] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_document_repeat1, 2, 0, 0), SHIFT_REPEAT(75),
  [236] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_document_repeat1, 2, 0, 0), SHIFT_REPEAT(64),
  [239] = {.entry = {.count = 2, .reusable = true}}, REDUCE(aux_sym_document_repeat1, 2, 0, 0), SHIFT_REPEAT(74),
  [242] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_document, 1, 0, 0),
  [244] = {.entry = {.count = 1, .reusable = true}}, SHIFT(57),
  [246] = {.entry = {.count = 1, .reusable = true}}, SHIFT(48),
  [248] = {.entry = {.count = 1, .reusable = true}}, SHIFT(43),
  [250] = {.entry = {.count = 1, .reusable = true}}, SHIFT(14),
  [252] = {.entry = {.count = 1, .reusable = true}}, SHIFT(2),
  [254] = {.entry = {.count = 1, .reusable = true}}, SHIFT(34),
  [256] = {.entry = {.count = 1, .reusable = true}}, SHIFT(30),
  [258] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_style_block, 4, 0, 3),
  [260] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_style_block, 5, 0, 3),
  [262] = {.entry = {.count = 1, .reusable = true}}, SHIFT(50),
  [264] = {.entry = {.count = 1, .reusable = true}}, SHIFT(37),
  [266] = {.entry = {.count = 1, .reusable = true}}, SHIFT(17),
  [268] = {.entry = {.count = 1, .reusable = true}}, SHIFT(11),
  [270] = {.entry = {.count = 1, .reusable = true}}, SHIFT(83),
  [272] = {.entry = {.count = 1, .reusable = true}}, SHIFT(9),
  [274] = {.entry = {.count = 1, .reusable = false}}, SHIFT(27),
  [276] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_node_kind, 1, 0, 0),
  [278] = {.entry = {.count = 1, .reusable = true}}, SHIFT(70),
  [280] = {.entry = {.count = 1, .reusable = true}}, SHIFT(51),
  [282] = {.entry = {.count = 1, .reusable = true}}, SHIFT(38),
  [284] = {.entry = {.count = 1, .reusable = true}},  ACCEPT_INPUT(),
  [286] = {.entry = {.count = 1, .reusable = true}}, SHIFT(18),
  [288] = {.entry = {.count = 1, .reusable = true}}, SHIFT(76),
  [290] = {.entry = {.count = 1, .reusable = true}}, SHIFT(41),
  [292] = {.entry = {.count = 1, .reusable = true}}, SHIFT(87),
  [294] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_property_name, 1, 0, 0),
  [296] = {.entry = {.count = 1, .reusable = true}}, SHIFT(61),
  [298] = {.entry = {.count = 1, .reusable = true}}, SHIFT(67),
  [300] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_anim_trigger, 2, 0, 0),
  [302] = {.entry = {.count = 1, .reusable = true}}, SHIFT(53),
  [304] = {.entry = {.count = 1, .reusable = true}}, SHIFT(5),
  [306] = {.entry = {.count = 1, .reusable = true}}, REDUCE(sym_annotation_keyword, 1, 0, 0),
  [308] = {.entry = {.count = 1, .reusable = true}}, SHIFT(8),
  [310] = {.entry = {.count = 1, .reusable = true}}, SHIFT(16),
  [312] = {.entry = {.count = 1, .reusable = true}}, SHIFT(15),
  [314] = {.entry = {.count = 1, .reusable = true}}, SHIFT(69),
  [316] = {.entry = {.count = 1, .reusable = true}}, SHIFT(52),
  [318] = {.entry = {.count = 1, .reusable = true}}, SHIFT(49),
  [320] = {.entry = {.count = 1, .reusable = true}}, SHIFT(63),
  [322] = {.entry = {.count = 1, .reusable = true}}, SHIFT(84),
  [324] = {.entry = {.count = 1, .reusable = true}}, SHIFT(36),
  [326] = {.entry = {.count = 1, .reusable = true}}, SHIFT(35),
  [328] = {.entry = {.count = 1, .reusable = true}}, SHIFT(82),
  [330] = {.entry = {.count = 1, .reusable = true}}, SHIFT(54),
  [332] = {.entry = {.count = 1, .reusable = true}}, SHIFT(66),
  [334] = {.entry = {.count = 1, .reusable = true}}, SHIFT(89),
};

#ifdef __cplusplus
extern "C" {
#endif
#ifdef TREE_SITTER_HIDE_SYMBOLS
#define TS_PUBLIC
#elif defined(_WIN32)
#define TS_PUBLIC __declspec(dllexport)
#else
#define TS_PUBLIC __attribute__((visibility("default")))
#endif

TS_PUBLIC const TSLanguage *tree_sitter_fd(void) {
  static const TSLanguage language = {
    .version = LANGUAGE_VERSION,
    .symbol_count = SYMBOL_COUNT,
    .alias_count = ALIAS_COUNT,
    .token_count = TOKEN_COUNT,
    .external_token_count = EXTERNAL_TOKEN_COUNT,
    .state_count = STATE_COUNT,
    .large_state_count = LARGE_STATE_COUNT,
    .production_id_count = PRODUCTION_ID_COUNT,
    .field_count = FIELD_COUNT,
    .max_alias_sequence_length = MAX_ALIAS_SEQUENCE_LENGTH,
    .parse_table = &ts_parse_table[0][0],
    .small_parse_table = ts_small_parse_table,
    .small_parse_table_map = ts_small_parse_table_map,
    .parse_actions = ts_parse_actions,
    .symbol_names = ts_symbol_names,
    .field_names = ts_field_names,
    .field_map_slices = ts_field_map_slices,
    .field_map_entries = ts_field_map_entries,
    .symbol_metadata = ts_symbol_metadata,
    .public_symbol_map = ts_symbol_map,
    .alias_map = ts_non_terminal_alias_map,
    .alias_sequences = &ts_alias_sequences[0][0],
    .lex_modes = ts_lex_modes,
    .lex_fn = ts_lex,
    .primary_state_ids = ts_primary_state_ids,
  };
  return &language;
}
#ifdef __cplusplus
}
#endif
