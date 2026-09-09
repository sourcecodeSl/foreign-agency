<?php

namespace App\Support;

/**
 * Minimal ZIP writer that streams straight to the response body.
 *
 * The obvious implementation is ZipArchive, but that needs ext-zip plus a
 * writable temp file, and shared hosting reliably has neither: cPanel PHP
 * builds often ship without the extension, and open_basedir hides
 * sys_get_temp_dir() so tempnam() quietly returns false. Nothing below needs
 * more than core PHP, so the archive builds the same way everywhere and never
 * touches the filesystem.
 *
 * Deliberately plain: no zip64 and no encryption, which caps an archive at
 * 4 GB and 65,535 entries - far above the eight documents a candidate has.
 */
final class ZipStream
{
    private const SIG_LOCAL = "\x50\x4b\x03\x04";

    private const SIG_CENTRAL = "\x50\x4b\x01\x02";

    private const SIG_END = "\x50\x4b\x05\x06";

    /** Bit 11 tells the reader that entry names are UTF-8. */
    private const FLAG_UTF8 = 0x0800;

    private const METHOD_STORE = 0;

    private const METHOD_DEFLATE = 8;

    /** Kept per entry until the central directory is written at the end. */
    private array $entries = [];

    /** Bytes written so far - each entry records where its header started. */
    private int $offset = 0;

    private readonly int $dosTime;

    private readonly int $dosDate;

    public function __construct(?int $timestamp = null)
    {
        $at = getdate($timestamp ?? time());

        $this->dosTime = ($at['hours'] << 11) | ($at['minutes'] << 5) | ($at['seconds'] >> 1);
        $this->dosDate = (max($at['year'] - 1980, 0) << 9) | ($at['mon'] << 5) | $at['mday'];
    }

    /** Adds one file. Folders are implied by the slashes in $name. */
    public function add(string $name, string $contents): void
    {
        $name = strtr($name, ['\\' => '/']);
        $crc = crc32($contents);
        $size = strlen($contents);

        // Compress only when it actually pays off; an already-compressed PDF
        // or JPEG usually grows, and a stored entry reads back just as well.
        $method = self::METHOD_STORE;
        $payload = $contents;

        if ($size > 0 && function_exists('gzdeflate')) {
            $deflated = @gzdeflate($contents, 6);
            if ($deflated !== false && strlen($deflated) < $size) {
                $method = self::METHOD_DEFLATE;
                $payload = $deflated;
            }
        }

        $compressed = strlen($payload);

        $this->entries[] = [
            'name' => $name,
            'crc' => $crc,
            'size' => $size,
            'compressed' => $compressed,
            'method' => $method,
            'offset' => $this->offset,
        ];

        $this->write(
            self::SIG_LOCAL
            .pack('v', 20)                  // version needed to extract
            .pack('v', self::FLAG_UTF8)
            .pack('v', $method)
            .pack('v', $this->dosTime)
            .pack('v', $this->dosDate)
            .pack('V', $crc)
            .pack('V', $compressed)
            .pack('V', $size)
            .pack('v', strlen($name))
            .pack('v', 0)                   // no extra field
            .$name
        );

        $this->write($payload);
    }

    /** Writes the central directory. Nothing may be added afterwards. */
    public function finish(): void
    {
        $start = $this->offset;

        foreach ($this->entries as $entry) {
            $this->write(
                self::SIG_CENTRAL
                .pack('v', 0x031E)          // made by: unix, zip 3.0
                .pack('v', 20)              // version needed to extract
                .pack('v', self::FLAG_UTF8)
                .pack('v', $entry['method'])
                .pack('v', $this->dosTime)
                .pack('v', $this->dosDate)
                .pack('V', $entry['crc'])
                .pack('V', $entry['compressed'])
                .pack('V', $entry['size'])
                .pack('v', strlen($entry['name']))
                .pack('v', 0)               // extra length
                .pack('v', 0)               // comment length
                .pack('v', 0)               // disk number
                .pack('v', 0)               // internal attributes
                .pack('V', 0100644 << 16)   // external attributes: rw-r--r--
                .pack('V', $entry['offset'])
                .$entry['name']
            );
        }

        $count = count($this->entries);

        $this->write(
            self::SIG_END
            .pack('v', 0)                   // this disk
            .pack('v', 0)                   // disk holding the directory
            .pack('v', $count)
            .pack('v', $count)
            .pack('V', $this->offset - $start)
            .pack('V', $start)
            .pack('v', 0)                   // no archive comment
        );
    }

    private function write(string $bytes): void
    {
        $this->offset += strlen($bytes);
        echo $bytes;
    }
}
