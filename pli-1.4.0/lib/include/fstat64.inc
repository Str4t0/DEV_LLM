 %replace sys_fstat64 by 197; 
 /* LFS version of sys_fstat                                           */
 /* PL/I version 1.1.1 -- July, 2023                                   */
 dcl    1 stat64              based,
          5 st_dev            char(8),       /* FIXED BIN(64) unsigned */
          5 st_pad0           char(4),
          5 _st_ino           fixed bin(32)  unsigned,
          5 st_mode           bit(32),
          5 st_nlink          fixed bin(31),
          5 st_uid            fixed bin(31),
          5 st_gid            fixed bin(31),
          5 st_rdev           char(8),       /* FIXED BIN(64) unsigned */
          5 st_pad3           char(4),
          5 st_size           char(8),       /* FIXED BIN(64) unsigned */
          5 st_blksize        fixed bin(31),
          5 st_blocks         char(8),       /* FIXED BIN(64) unsigned */
          5 st_atime          fixed bin(32)  unsigned,
          5 st_atime_nsec     fixed bin(32)  unsigned,
          5 st_mtime          fixed bin(32)  unsigned,
          5 st_mtime_nsec     fixed bin(32)  unsigned,
          5 st_ctime          fixed bin(32)  unsigned,
          5 st_ctime_nsec     fixed bin(32)  unsigned,
          5 st_ino            fixed bin(32)  unsigned,
          5 st_end            char(0);
