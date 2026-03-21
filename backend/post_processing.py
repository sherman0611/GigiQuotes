import re
import database as db

class TranscriptionTrimmer:
    def __init__(self):
        # Updated pattern: Matches a word followed by itself one or more times
        # Separated by spaces OR hyphens: e.g., "fizz-fizz-fizz" or "the the"
        self.stutter_pattern = re.compile(r'\b(\w+)(?:[\s-]+(\1\b))+', re.IGNORECASE)

    def remove_stutters(self, text: str) -> str:
        """Removes immediate word-level repetitions, including hyphenated ones."""
        #
        return self.stutter_pattern.sub(r'\1', text)

    def remove_phrase_loops(self, text: str, max_phrase_words: int = 5) -> str:
        """
        Detects and trims repeating sequences of words (loops).
        Example: 'I think that I think that' -> 'I think that'
        """
        #
        words = text.split()
        if not words:
            return ""

        n = len(words)
        # Iterate backwards to catch the longest possible loops first
        for length in range(max_phrase_words, 0, -1):
            i = 0
            while i <= n - (length * 2):
                phrase = words[i : i + length]
                next_phrase = words[i + length : i + (length * 2)]
                
                if phrase == next_phrase:
                    # Found a repeat! Remove the second instance
                    del words[i + length : i + (length * 2)]
                    n = len(words)
                else:
                    i += 1
        
        return " ".join(words)

    def process(self, text: str) -> str:
        """Complete pipeline for trimming stutters, loops, and trailing punctuation."""
        if not text:
            return ""
        # 1. Clean up "fizz-fizz-fizz" style stutters
        text = self.remove_stutters(text)
        # 2. Clean up "I think that I think that" style loops
        text = self.remove_phrase_loops(text)
        # 3. Final cleanup of whitespace and trailing hyphens from stutters
        return " ".join(text.split()).strip("- ")

    def process_all_quotes_in_db(self):
        """
        Fetches ALL quotes from the database, applies trimming logic,
        and updates records only if changes were made.
        """
        #
        conn = None
        try:
            conn = db.connect()
            cur = conn.cursor()

            cur.execute("SELECT id, content FROM quotes")
            rows = cur.fetchall()

            total_updated = 0
            print(f"Processing all {len(rows)} quotes in database...")

            for quote_id, content in rows:
                if not content: continue
                cleaned_content = self.process(content)

                if cleaned_content != content:
                    # UPDATED QUERY:
                    cur.execute("""
                        UPDATE quotes 
                        SET content = %s, 
                            content_tsv = to_tsvector('simple', %s) 
                        WHERE id = %s
                    """, (cleaned_content, cleaned_content, quote_id))
                    total_updated += 1

            conn.commit()
            print(f"Success! Cleaned and updated {total_updated} quotes.")

        except Exception as e:
            print(f"An error occurred during bulk DB processing: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                cur.close()
                conn.close()

    def process_all_quotes(self, vod_id):
        """
        Fetches quotes for a specific VOD, applies trimming logic, and updates records.
        """
        #
        conn = None
        try:
            conn = db.connect()
            cur = conn.cursor()

            query = "SELECT id, content FROM quotes WHERE vod_id = %s"
            cur.execute(query, (vod_id,))
            rows = cur.fetchall()

            total_updated = 0
            print(f"Processing {len(rows)} quotes for VOD ID: {vod_id}...")

            for quote_id, content in rows:
                if not content: continue
                cleaned_content = self.process(content)

                if cleaned_content != content:
                    # UPDATED QUERY:
                    cur.execute("""
                        UPDATE quotes 
                        SET content = %s, 
                            content_tsv = to_tsvector('simple', %s) 
                        WHERE id = %s
                    """, (cleaned_content, cleaned_content, quote_id))
                    total_updated += 1

            conn.commit()
            print(f"Success! Cleaned and updated {total_updated} quotes for VOD {vod_id}.")

        except Exception as e:
            print(f"An error occurred during VOD processing: {e}")
            if conn:
                conn.rollback()
        finally:
            if conn:
                cur.close()
                conn.close()

def replace_word(word_to_fix, target_word):
    """
    Replaces a word while preserving its casing (lowercase, Capitalized, or UPPERCASE)
    in the 'content' column of the 'quotes' table.
    """
    # Prepare the variations
    variants = [
        word_to_fix.lower(),
        word_to_fix.capitalize(),
        word_to_fix.upper(),
    ]

    conn = None
    try:
        conn = db.connect()
        cur = conn.cursor()

        total_affected = 0
        
        # We iterate through the variations to ensure exact case matching
        for variant in variants:
            sql = """
                UPDATE quotes 
                SET content = REPLACE(content, %s, %s)
                WHERE content LIKE %s;
            """
            search_pattern = f"%{variant}%"
            cur.execute(sql, (variant, target_word, search_pattern))
            total_affected += cur.rowcount

        conn.commit()
        print(f"Update complete. Total instances modified: {total_affected}")

    except Exception as e:
        print(f"An error occurred: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()

def delete_single_word(vod_id):
    """
    Deletes rows from the 'quotes' table for a specific VOD where the 
    'content' column contains only a single word.
    """
    conn = None
    try:
        conn = db.connect()
        cur = conn.cursor()

        # Added AND vod_id = %s to scope the deletion
        sql = """
            DELETE FROM quotes 
            WHERE vod_id = %s
            AND content NOT LIKE '%% %%' 
            AND content != '';
        """
        
        cur.execute(sql, (vod_id,))
        total_deleted = cur.rowcount
        
        conn.commit()
        print(f"Cleanup complete for VOD {vod_id}. Deleted {total_deleted} single-word quotes.")

    except Exception as e:
        print(f"An error occurred during deletion: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()

if __name__ == '__main__':

    id = "1g5iPlzFlVY"

    delete_single_word(id)

    trimmer = TranscriptionTrimmer()
    trimmer.process_all_quotes(id)

    replace_word("yowie", "yaoi")
    replace_word("So see the immigrants", "Cecilia Immergreen")
    replace_word("more coliope", "Mori Calliope")
    replace_word("league of legends", "League of Legends")
    replace_word("callie", "Calli")
    replace_word("muddin", "Murin")
    replace_word("jiji", "Gigi")
    replace_word("Gigi tomo", "Gigi-Tomo")
    replace_word("yowi", "yaoi")
    replace_word("immigreen", "Immergreen")
    replace_word("mcgrew", "Immergreen")
    replace_word("ebbinggwee", "Immergreen")
    replace_word("emmergreen", "Immergreen")
    replace_word("emmergree", "Immergreen")
    replace_word("ceci", "Cece")
    replace_word("seci", "Cece")
    replace_word("cc", "Cece")
    replace_word("cici", "Cece")
    replace_word("grams", "grems")
    replace_word("gram", "grem")
    replace_word("Oral Crony", "Ouro Kronii")
    replace_word("jimoonie", "Gimurin")
    replace_word("jimunin", "Gimurin")