var $message=jQuery('<span class="kapow-mes"></span>').appendTo("#commentform");
var solverLoop;
var libraryLoaded = false;


// Ajax Handler
jQuery('#commentform').submit(function(){
   if(!libraryLoaded){
       jQuery.getScript(kapowSettings.bigUrl);
       jQuery.getScript(kapowSettings.shaUrl);
	   jQuery.getScript(kapowSettings.fishy);
       libraryLoaded = true;
   }
    
   request = jQuery.ajax({
     beforeSend:function(xhr){
        xhr.setRequestHeader("If-Modified-Since","0");
        $message.empty().append('<img src="'+kapowSettings.gifUrl+'" alt="processing...">    Getting the puzzle from server!');
     },
     type:'post',
     // point to process.php for processing Dc, Nc
     url:kapowSettings.processUrl,
     data:jQuery(this).serialize(),
     dataType:'json'
   });

    request.done( function(data){
        var stringified = JSON.stringify(data);
        var raw = jQuery.parseJSON(stringified);
        var S = raw.S;
        var ts = raw.ts;
        request = jQuery.ajax({
            beforeSend:function(xhr){
                xhr.setRequestHeader("If-Modified-Since","0");
                $message.empty().append('<img src="'+kapowSettings.gifUrl+'" alt="processing...">  Getting the puzzle from server!');
            },
            type:'POST',
            // submit cookies to headwinds centralized server for puzzle issuing
            url:kapowSettings.initUrl,
            data:'message='+JSON.stringify(data),
            dataType:'jsonp',
			error: function (xhr, ajaxOptions, thrownError) {
				alert(xhr.status);
				alert(thrownError);
				}
        });
        request.done( function(data){
            solverLoop = new SolverLoop(data, S, ts);
        });

    });
  return false;
});

function SolverLoop(data, S, ts){
    var uid = data.uid;
    var compute = function(){
        if(data.result == 'success') {
            if(data.type == 'puzzle'){
                id = 'puzzle'+Math.floor(Math.random()*1000);
                jQuery("body").append('<script id="'+id+'" type="text/javascript">'+data.content.content+'</script>');
                jQuery('#'+id).ready( function() {
                    $message.empty().append('<img src="'+kapowSettings.gifUrl+'" alt="processing...">  Solving sub-puzzles!');
                    // solve new algo
                    id = new Solve({
                        id: id, // object containing this solver
                        tag: {
                            AA: data.content[3],
                            NN: data.content[2],
                            TT: data.content[1]
                        },
                        callback: function(answer) {
                            submit = jQuery.ajax({// submit the form after having the answer
                                url:kapowSettings.verifyUrl + '?callback=?',
                                dataType: "jsonp",
                                data: {
                                    answer: answer,
                                    uid: uid
                                },
                                type: "POST",
                                success:function(data){
                                   solverLoop = new SolverLoop(data, S, ts);
                                } // close success
                            });//end of ajax 2
                        }
                    }); // close solve
                }); // close ready
            } else if(data.type == 'done'){
                // make another ajax call to posts.php general web app with sessionID
                var submitData = jQuery('#commentform').serialize();
                request = jQuery.ajax({
                    beforeSend:function(xhr){
                        xhr.setRequestHeader("If-Modified-Since","0");
                        $message.empty().append('<img src="'+kapowSettings.gifUrl+'" alt="processing...">  Notify web app that puzzle has been solved successfully!');
                    },
                    type:'POST',
                    // point to posts.php of the application
                    url:kapowSettings.processUrl,
                    data:{
                        uid: data.uid,
                        Adone: data.Adone,
                        S: S,
                        ts: ts,
                        data: submitData
                    },
                    dataType:'json'
                });
                request.done( function(data){
                    if(data){
                        $message.empty().append('Message Posted!');
                        //location.reload();
                    }else{
                        $message.empty().append('Invalid Cookies! Did you really solve the puzzles?');
                    }
                });
                          
            }
        } else {
            $message.empty().append('ERROR!');
        }
    };
    compute();
}
