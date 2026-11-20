import com.csrgo.telugustates.fieldtest.AssetRoute;
import java.util.Objects;
public class Routes {
    static int n;
    static void same(Object a,Object b){n++; if(!Objects.equals(a,b)) throw new AssertionError(a+" != "+b);}
    public static void main(String[] x){
        same(AssetRoute.origin("https","appassets.androidplatform.net",-1,null),true);
        same(AssetRoute.origin("https","APPASSETS.ANDROIDPLATFORM.NET",443,null),true);
        same(AssetRoute.origin("https","appassets.androidplatform.net.test",-1,null),false);
        same(AssetRoute.origin("http","appassets.androidplatform.net",-1,null),false);
        same(AssetRoute.origin("https","appassets.androidplatform.net",443,"fred"),false);
        same(AssetRoute.origin("https","appassets.androidplatform.net",6443,null),false);
        same(AssetRoute.key("/"),"atlas/index.html");same(AssetRoute.key("/_field/"),"console/index.html");
        same(AssetRoute.key("/_field/field.js"),"console/field.js");same(AssetRoute.key("/houses/demo_user1/"),"atlas/houses/demo_user1/index.html");
        same(AssetRoute.key("/frozen/tiles/9_30.bin"),"atlas/frozen/tiles/9_30.bin");same(AssetRoute.mime("a.js"),"text/javascript");same(AssetRoute.mime("a.bin.gz"),"application/octet-stream");same(AssetRoute.mime("a.woff2"),"font/woff2");same(AssetRoute.text("application/octet-stream"),false);
        for(String s:new String[]{null,"", "../x","//f","/_field/../atlas","/.//x","/x/./file","/x/%2e%2e/f","/x\\f","/a:b","/a\u0000b","/_field/share","/_field/photo","/_field/resident"})same(AssetRoute.key(s),null);
        System.out.println(n+" route/origin/MIME checks passed.");
    }
}
