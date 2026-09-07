import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.security.*;
import java.util.HexFormat;

/** Structural inspection only. Never loads or runs the submitted executable. */
public class ExeInspector {
 public static void main(String[] args) throws Exception {
  if(args.length!=2)throw new IllegalArgumentException("Usage: ExeInspector file.exe expected-sha256");
  Path path=Path.of(args[0]);long size=Files.size(path);
  if(size<64||size>2147483648L)throw new IOException("Invalid executable size");
  int machine;
  try(RandomAccessFile file=new RandomAccessFile(path.toFile(),"r")){
   if(file.read()!=0x4d||file.read()!=0x5a)throw new IOException("Missing MZ header");
   file.seek(60);long offset=Integer.toUnsignedLong(Integer.reverseBytes(file.readInt()));
   if(offset<64||offset>size-6)throw new IOException("Invalid PE offset");
   file.seek(offset);if(file.readInt()!=0x50450000)throw new IOException("Missing PE signature");
   machine=Short.toUnsignedInt(Short.reverseBytes(file.readShort()));
   if(machine!=0x14c&&machine!=0x8664&&machine!=0xaa64)throw new IOException("Unsupported architecture");
  }
  MessageDigest hash=MessageDigest.getInstance("SHA-256");
  try(InputStream input=Files.newInputStream(path)){byte[] b=new byte[65536];int n;while((n=input.read(b))!=-1)hash.update(b,0,n);}
  String actual=HexFormat.of().formatHex(hash.digest());
  if(!MessageDigest.isEqual(actual.getBytes(java.nio.charset.StandardCharsets.US_ASCII),args[1].getBytes(java.nio.charset.StandardCharsets.US_ASCII)))throw new IOException("SHA-256 mismatch");
  System.out.println("{\"structurallyValid\":true,\"machine\":"+machine+",\"size\":"+size+",\"sha256\":\""+actual+"\",\"malwareScanned\":false}");
 }
}
