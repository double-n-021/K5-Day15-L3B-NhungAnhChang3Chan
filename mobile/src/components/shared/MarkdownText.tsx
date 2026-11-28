import React from 'react';
import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SPACING } from '@/theme/tokens';
import { FONT_FAMILY, TYPOGRAPHY } from '@/theme/typography';

interface MarkdownTextProps {
  children: string;
  baseStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

/**
 * Strip markdown syntax for plain-text contexts (e.g. TTS or compact 1-line speech bubbles).
 */
export function stripMarkdown(input: string): string {
  return (input || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .trim();
}

const INLINE_TOKEN_RE =
  /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|\*[^*\n]+?\*|\[(?:ST|MOTO)_[A-Z0-9_]+\])/g;

function renderInline(
  text: string,
  baseStyle: TextStyle,
  keyPrefix: string
): React.ReactNode[] {
  const parts = text.split(INLINE_TOKEN_RE);
  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${keyPrefix}-${idx}`;

    // Bold: **text** or __text__
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length > 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length > 4)
    ) {
      const inner = part.slice(2, -2);
      return (
        <Text key={key} style={[baseStyle, styles.bold]}>
          {renderInline(inner, { ...baseStyle, ...styles.bold }, `${key}-b`)}
        </Text>
      );
    }

    // Inline code: `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={key} style={[baseStyle, styles.inlineCode]}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    // Italic: *text*
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <Text key={key} style={[baseStyle, styles.italic]}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    // Station code highlight: [ST_HK_04], [MOTO_HN_001], [ST_OSM_...]
    if (/^\[(?:ST|MOTO)_[A-Z0-9_]+\]$/.test(part)) {
      return (
        <Text key={key} style={[baseStyle, styles.stationCode]}>
          {part}
        </Text>
      );
    }

    return (
      <Text key={key} style={baseStyle}>
        {part}
      </Text>
    );
  });
}

/**
 * Lightweight, zero-dependency React Native Markdown renderer tailored for ChargePilot AI chat replies.
 * Supports headings (#/##/###), bold (**), italic (*), inline code (`), station code badges,
 * bullet lists (- / * / •), numbered lists (1. / 2.), blockquotes (>), and horizontal rules (---).
 */
export function MarkdownText({ children, baseStyle, containerStyle }: MarkdownTextProps) {
  const mergedBase: TextStyle = {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    lineHeight: 20,
    ...(baseStyle || {}),
  };

  const lines = (children || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];

  lines.forEach((rawLine, i) => {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (blocks.length > 0) {
        blocks.push(<View key={`sp-${i}`} style={styles.paragraphGap} />);
      }
      return;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<View key={`hr-${i}`} style={styles.hr} />);
      return;
    }

    // Heading (#, ##, ###)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const hStyle: TextStyle =
        level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      blocks.push(
        <Text key={`h-${i}`} style={[mergedBase, hStyle]}>
          {renderInline(headingMatch[2], { ...mergedBase, ...hStyle }, `h-${i}`)}
        </Text>
      );
      return;
    }

    // Blockquote (> ...)
    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      blocks.push(
        <View key={`q-${i}`} style={styles.quoteBox}>
          <Text style={[mergedBase, styles.quoteText]}>
            {renderInline(quoteMatch[1], { ...mergedBase, ...styles.quoteText }, `q-${i}`)}
          </Text>
        </View>
      );
      return;
    }

    // Numbered list (1. ..., 2. ...)
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      blocks.push(
        <View key={`ol-${i}`} style={styles.listRow}>
          <Text style={[mergedBase, styles.listMarker]}>{numMatch[1]}.</Text>
          <Text style={[mergedBase, styles.listBody]}>
            {renderInline(numMatch[2], mergedBase, `ol-${i}`)}
          </Text>
        </View>
      );
      return;
    }

    // Bullet list (- ..., * ..., • ...)
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      blocks.push(
        <View key={`ul-${i}`} style={styles.listRow}>
          <Text style={[mergedBase, styles.listMarker]}>•</Text>
          <Text style={[mergedBase, styles.listBody]}>
            {renderInline(bulletMatch[1], mergedBase, `ul-${i}`)}
          </Text>
        </View>
      );
      return;
    }

    // Normal paragraph line
    blocks.push(
      <Text key={`p-${i}`} style={mergedBase}>
        {renderInline(trimmed, mergedBase, `p-${i}`)}
      </Text>
    );
  });

  return <View style={[styles.container, containerStyle]}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  paragraphGap: {
    height: 4,
  },
  bold: {
    fontFamily: FONT_FAMILY.vnBold,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  italic: {
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    color: COLORS.energyGreen,
  },
  stationCode: {
    fontFamily: FONT_FAMILY.vnBold,
    fontWeight: '700',
    color: COLORS.energyGreen,
  },
  h1: {
    fontFamily: FONT_FAMILY.vnBold,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 4,
  },
  h2: {
    fontFamily: FONT_FAMILY.vnBold,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: COLORS.energyGreen,
    marginTop: 4,
  },
  h3: {
    fontFamily: FONT_FAMILY.vnSemiBold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 2,
  },
  listMarker: {
    fontFamily: FONT_FAMILY.vnBold,
    color: COLORS.energyGreen,
    fontWeight: '700',
    minWidth: 16,
  },
  listBody: {
    flex: 1,
  },
  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.energyGreen,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  quoteText: {
    color: COLORS.textSecondary,
  },
  hr: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
});
