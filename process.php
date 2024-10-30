<?php
include_once "headwinds2lib.php";
header('Content-Type: text/html');
$root = dirname(dirname(dirname(dirname(__FILE__))));
if (file_exists($root.'/wp-load.php')) {
		// WP 2.6
		require_once($root.'/wp-load.php');
} else {
		// Before 2.6
		require_once($root.'/wp-config.php');
}

if(isset($_POST['comment'])){
    // return 2 to client
    $response = _headwinds2_return_initial_cookie($_POST['comment'], $_POST['author'], $_POST['email']);
    echo json_encode($response);
    die;
    // keep track of Ks..
    // $sessionID = $response['IDc'];

    //storeToTempFile($_POST, $sessionID);
}

if($_POST['Adone'] && $_POST['S']){
    // verify hash cookie
    $serializedData = $_POST['data'];
    $data =  array();
    parse_str($serializedData, $data);
    $Data = $data['comment'].$data['author'].$data['email'];
    $verify = _headwinds2_verify_hash_cookie($_POST['Adone'], $Data, $_POST['S'], $_POST['ts']);
    if($verify){
        $post = array(
            'comment_author' => $data['author'],
            'comment_author_email' => $data['email'],
            'comment_author_ip' => preg_replace( '/[^0-9., ]/', '', $_SERVER['REMOTE_ADDR']),
            'comment_author_url' => $data['url'],
            'comment_content'  => $data['comment'],
            'comment_post_ID' => $data['comment_post_ID'],
            'comment_parent' => $data['comment_parent'],
            'comment_approved' => 1
        );
        $id = wp_insert_comment($post);
        print_r($id);
    }else{
        // nothing
    }
}


?>
